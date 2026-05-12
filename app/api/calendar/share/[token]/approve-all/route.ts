import { NextResponse, after } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { publishScheduledPost } from '@/lib/calendar/schedule-drop';
import { reschedulePastDueDrafts } from '@/lib/calendar/reschedule-past-due';
import { consumeForApproval } from '@/lib/credits/comment-hooks';
import {
  findContentCalendarItem,
  groupTitleForCalendarStart,
  syncMondayApprovalForDrop,
} from '@/lib/monday/calendar-approval';
import { isMondayConfigured } from '@/lib/monday/client';
import {
  buildChatCard,
  postToGoogleChatSafe,
  type ChatCardWidget,
} from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';
import { resolvePaidMediaWebhook } from '@/lib/chat/resolve-paid-media-webhook';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

/**
 * POST /api/calendar/share/[token]/approve-all
 *
 * Admin-only bulk approval for every still-pending post in a share link.
 * Mirrors the public `/c/[token]` page's `approveAll` flow but consolidates
 * N HTTP roundtrips into a single server-side loop.
 *
 * Per post the pipeline matches the per-comment route:
 *   1. Insert an `approved` row in `post_review_comments`.
 *   2. Call `publishScheduledPost` (idempotent: re-runs are a no-op).
 *   3. Call `consumeForApproval` for credit accounting (state-based dedup).
 *
 * After the per-post loop, runs the drop-level work once via `after()`:
 *   - Monday calendar approval sync (state-derived)
 *   - Atomic all-approved claim → 🎉 chat ping if won
 *   - Paid-media team ping (if applicable)
 *
 * Returns recomputed counters so the modal/table can patch optimistically
 * without a parent refetch.
 */

interface ShareLinkRow {
  id: string;
  drop_id: string;
  expires_at: string;
  post_review_link_map: Record<string, string>;
}

interface CommentRow {
  review_link_id: string;
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

type LiveStatus = 'approved' | 'changes_requested' | null;

/**
 * Server-side mirror of the public share page's `latestReview` walk.
 * Newest → oldest, skipping `changes_requested` rows whose metadata is
 * marked resolved. First live signal wins. Returns null when nothing is
 * live (pending).
 */
function latestLiveStatus(comments: CommentRow[]): LiveStatus {
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.status === 'approved') return 'approved';
    if (c.status === 'changes_requested') {
      const resolved = !!(c.metadata && (c.metadata as Record<string, unknown>).resolved);
      if (!resolved) return 'changes_requested';
    }
  }
  return null;
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Resolve the admin's display name for the audit trail. team_members.full_name
  // is the canonical source; fall back to email so the comment row never
  // ends up with a NULL author_name.
  const { data: teamMember } = await admin
    .from('team_members')
    .select('full_name')
    .eq('user_id', user.id)
    .maybeSingle<{ full_name: string | null }>();
  const reviewerName =
    (teamMember?.full_name?.trim() ||
      user.email?.trim() ||
      'Cortex admin');

  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, expires_at, post_review_link_map')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  let reviewLinkMap = link.post_review_link_map ?? {};

  // Backfill drift: a share link's `post_review_link_map` is built at share
  // creation time, so any drop video added later (e.g. via the calendar
  // upload flow that appends posts to an existing drop) ends up with a
  // scheduled_post + content_drop_videos row but no entry in the map. The
  // share page still tallies it in the "X / N" denominator, so approve-all
  // can never close the gap and the calendar gets stuck at e.g. 9 / 10.
  // Reconcile in-place: for any drop video whose post is missing from the
  // map, mint a `post_review_links` row if one doesn't exist yet, then
  // append the entry. Idempotent and cheap.
  const { data: dropVideos } = await admin
    .from('content_drop_videos')
    .select('scheduled_post_id')
    .eq('drop_id', link.drop_id);
  const dropPostIds = new Set(
    (dropVideos ?? [])
      .map((r) => (r as { scheduled_post_id: string | null }).scheduled_post_id)
      .filter((id): id is string => !!id),
  );
  const missingPostIds = Array.from(dropPostIds).filter(
    (postId) => !(postId in reviewLinkMap),
  );
  if (missingPostIds.length > 0) {
    // Only mint links for posts that still exist (skip orphaned drop_videos
    // pointing to deleted scheduled_posts).
    const { data: livePosts } = await admin
      .from('scheduled_posts')
      .select('id')
      .in('id', missingPostIds);
    const liveMissing = (livePosts ?? []).map((r) => (r as { id: string }).id);
    if (liveMissing.length > 0) {
      // Reuse any existing review_link for these posts, else mint a new one.
      const { data: existingLinks } = await admin
        .from('post_review_links')
        .select('id, post_id')
        .in('post_id', liveMissing);
      const existingByPost = new Map<string, string>();
      for (const row of existingLinks ?? []) {
        const r = row as { id: string; post_id: string };
        if (!existingByPost.has(r.post_id)) existingByPost.set(r.post_id, r.id);
      }
      const postsNeedingLink = liveMissing.filter((id) => !existingByPost.has(id));
      if (postsNeedingLink.length > 0) {
        const expires = new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        ).toISOString();
        const { data: newLinks, error: linkErr } = await admin
          .from('post_review_links')
          .insert(
            postsNeedingLink.map((post_id) => ({ post_id, expires_at: expires })),
          )
          .select('id, post_id');
        if (linkErr) {
          console.error('approve-all: backfill link insert error:', linkErr);
        } else {
          for (const row of newLinks ?? []) {
            const r = row as { id: string; post_id: string };
            existingByPost.set(r.post_id, r.id);
          }
        }
      }
      const additions: Record<string, string> = {};
      for (const postId of liveMissing) {
        const lid = existingByPost.get(postId);
        if (lid) additions[postId] = lid;
      }
      if (Object.keys(additions).length > 0) {
        const merged = { ...reviewLinkMap, ...additions };
        const { error: mapErr } = await admin
          .from('content_drop_share_links')
          .update({ post_review_link_map: merged })
          .eq('id', link.id);
        if (mapErr) {
          console.error('approve-all: backfill map update error:', mapErr);
        } else {
          reviewLinkMap = merged;
          console.warn(
            `approve-all: backfilled ${Object.keys(additions).length} missing map ` +
              `entr${Object.keys(additions).length === 1 ? 'y' : 'ies'} for share link ${link.id}`,
          );
        }
      }
    }
  }

  const reviewLinkEntries = Object.entries(reviewLinkMap); // [postId, reviewLinkId][]
  if (reviewLinkEntries.length === 0) {
    return NextResponse.json({
      approved: 0,
      skipped: 0,
      failed: 0,
      approved_count: 0,
      changes_count: 0,
      pending_count: 0,
      status: 'ready_for_review',
      post_count: 0,
    });
  }

  const reviewLinkIds = reviewLinkEntries.map(([, id]) => id);

  // Pull every existing comment for this link's review ids in a single
  // query, then group by review_link_id and run the same newest-first
  // walk the public share page uses to figure out which posts are
  // already approved (and therefore skip-targets).
  const { data: existingComments } = await admin
    .from('post_review_comments')
    .select('review_link_id, status, created_at, metadata')
    .in('review_link_id', reviewLinkIds)
    .order('created_at', { ascending: true });

  const commentsByReviewLink = new Map<string, CommentRow[]>();
  for (const row of existingComments ?? []) {
    const arr = commentsByReviewLink.get(row.review_link_id) ?? [];
    arr.push(row as CommentRow);
    commentsByReviewLink.set(row.review_link_id, arr);
  }

  // Filter out orphaned map entries before doing any work. Share-link
  // `post_review_link_map` is a denormalized JSON column, so if a
  // scheduled_post or its post_review_links row gets deleted out from
  // under us (e.g. by the draft cleanup cron), the stale (postId,
  // reviewLinkId) pair lingers here and breaks every future approve-all
  // with an FK violation on the comment insert. Drop those entries and
  // log a warning instead of failing the whole bulk action.
  const postIds = reviewLinkEntries.map(([postId]) => postId);
  const reviewLinkIdSet = new Set(reviewLinkEntries.map(([, id]) => id));
  const [existingPostsRes, existingLinksRes] = await Promise.all([
    admin.from('scheduled_posts').select('id').in('id', postIds),
    admin.from('post_review_links').select('id').in('id', Array.from(reviewLinkIdSet)),
  ]);
  const livePostIds = new Set(
    (existingPostsRes.data ?? []).map((r) => (r as { id: string }).id),
  );
  const liveLinkIds = new Set(
    (existingLinksRes.data ?? []).map((r) => (r as { id: string }).id),
  );
  const orphanedEntries = reviewLinkEntries.filter(
    ([postId, reviewLinkId]) =>
      !livePostIds.has(postId) || !liveLinkIds.has(reviewLinkId),
  );
  if (orphanedEntries.length > 0) {
    console.warn(
      `approve-all: pruning ${orphanedEntries.length} orphaned map entr` +
        `${orphanedEntries.length === 1 ? 'y' : 'ies'} from share link ${link.id}:`,
      orphanedEntries,
    );
    let prunedMap = reviewLinkMap;
    for (const [postId] of orphanedEntries) {
      const { [postId]: _drop, ...rest } = prunedMap;
      void _drop;
      prunedMap = rest;
    }
    const { error: pruneErr } = await admin
      .from('content_drop_share_links')
      .update({ post_review_link_map: prunedMap })
      .eq('id', link.id);
    if (pruneErr) {
      console.error('approve-all: failed to prune orphaned map entries:', pruneErr);
    }
  }

  // Targets: posts whose latest live status is NOT 'approved'. Mirrors
  // `app/c/[token]/page.tsx:284`: pending and revising both count.
  const targets: Array<{ postId: string; reviewLinkId: string }> = [];
  for (const [postId, reviewLinkId] of reviewLinkEntries) {
    if (!livePostIds.has(postId) || !liveLinkIds.has(reviewLinkId)) continue;
    const status = latestLiveStatus(commentsByReviewLink.get(reviewLinkId) ?? []);
    if (status !== 'approved') {
      targets.push({ postId, reviewLinkId });
    }
  }

  // Past-due fixup: if the client is approving days/weeks after a post's
  // original scheduled time, shift those past-due drafts to gaps in the
  // current calendar month BEFORE we hand them to publishScheduledPost.
  // Otherwise Zernio either spam-publishes them all back-to-back or rejects
  // with "scheduledFor must be in the future". See lib/calendar/reschedule-past-due.
  const pastDue = await reschedulePastDueDrafts(
    admin,
    targets.map((t) => t.postId),
  );

  let approved = 0;
  let failed = 0;
  for (const { postId, reviewLinkId } of targets) {
    const { error: insertError } = await admin
      .from('post_review_comments')
      .insert({
        review_link_id: reviewLinkId,
        author_name: reviewerName,
        content: 'Approved',
        status: 'approved',
        attachments: [],
        metadata: { admin_bulk_approval: true, approver_user_id: user.id },
        timestamp_seconds: null,
      });
    if (insertError) {
      console.error(`Bulk approve insert failed for post ${postId}:`, insertError);
      failed += 1;
      continue;
    }

    // publishScheduledPost is idempotent (returns alreadyPublished=true if
    // already scheduled). Failures here don't block the comment row that
    // already landed; the post-health reconciler will catch a stuck draft.
    try {
      await publishScheduledPost(admin, postId);
    } catch (err) {
      console.error(`Bulk approve → Zernio publish failed for post ${postId}:`, err);
    }

    // Approval-as-consumption. State-based dedup makes this safe even if
    // the post was previously approved → un-approved → re-approved.
    try {
      await consumeForApproval(admin, {
        scheduledPostId: postId,
        shareLinkId: link.id,
        reviewerName,
        reviewLinkId,
      });
    } catch (err) {
      console.error(`Bulk approve credit consume failed for post ${postId}:`, err);
    }

    approved += 1;
  }

  // Recompute final counters for the optimistic patch sent back to the
  // caller. Refetch comments so the just-inserted approvals are reflected;
  // walk the same latestLiveStatus to derive approved/changes/pending.
  const { data: refreshed } = await admin
    .from('post_review_comments')
    .select('review_link_id, status, created_at, metadata')
    .in('review_link_id', reviewLinkIds)
    .order('created_at', { ascending: true });

  const refreshedByReviewLink = new Map<string, CommentRow[]>();
  for (const row of refreshed ?? []) {
    const arr = refreshedByReviewLink.get(row.review_link_id) ?? [];
    arr.push(row as CommentRow);
    refreshedByReviewLink.set(row.review_link_id, arr);
  }

  let approvedCount = 0;
  let changesCount = 0;
  for (const [, reviewLinkId] of reviewLinkEntries) {
    const status = latestLiveStatus(refreshedByReviewLink.get(reviewLinkId) ?? []);
    if (status === 'approved') approvedCount += 1;
    else if (status === 'changes_requested') changesCount += 1;
  }
  const pendingCount = reviewLinkEntries.length - approvedCount - changesCount;

  // Mirror the unified status derivation. The next /api/calendar/review
  // refetch is the source of truth, but this lets the table flip
  // immediately while that's in flight.
  const nextStatus =
    approvedCount === reviewLinkEntries.length
      ? 'approved'
      : changesCount > 0
        ? 'revising'
        : 'ready_for_review';

  // Drop-level post-response work. Collapsed into one Monday sync + one
  // chat ping for the whole batch instead of running per post.
  after(async () => {
    try {
      await syncMondayApprovalForDrop(admin, link.drop_id);
    } catch (err) {
      console.error('Monday sync after bulk approve failed:', err);
    }

    // Past-due fixup notification (Jack-only, per the client's chat webhook).
    // We never tell the client we moved their posts — Jack handles that out-of-band.
    if (pastDue.moves.length > 0 || pastDue.overflow.length > 0) {
      try {
        await notifyPastDueFixup(admin, link.drop_id, pastDue);
      } catch (err) {
        console.error('Past-due fixup notification failed:', err);
      }
    }

    if (approvedCount === reviewLinkEntries.length) {
      // Atomic claim, same dedup pattern as the per-comment route. Two
      // concurrent triggers (bulk + manual race) won't double-fire.
      const { data: claimed } = await admin
        .from('content_drop_share_links')
        .update({ all_approved_notified_at: new Date().toISOString() })
        .eq('id', link.id)
        .is('all_approved_notified_at', null)
        .select('id')
        .maybeSingle();

      if (claimed) {
        try {
          await fireAllApprovedNotifications(
            admin,
            link.drop_id,
            token,
            reviewLinkEntries.length,
          );
        } catch (err) {
          console.error('All-approved notifications failed:', err);
        }
      }
    }
  });

  return NextResponse.json({
    approved,
    skipped: reviewLinkEntries.length - targets.length,
    failed,
    approved_count: approvedCount,
    changes_count: changesCount,
    pending_count: pendingCount,
    status: nextStatus,
    post_count: reviewLinkEntries.length,
  });
}

/**
 * Posts a Jack-only summary to the client's Google Chat webhook explaining
 * which past-due posts were shifted to gaps in the current month, plus any
 * overflow posts that didn't fit. Never goes to the client. Silently no-ops
 * if neither a per-client webhook nor an agency misc-catchall is configured.
 */
async function notifyPastDueFixup(
  admin: ReturnType<typeof createAdminClient>,
  dropId: string,
  result: {
    moves: Array<{ postId: string; oldScheduledAt: string; newScheduledAt: string; doubledUp: boolean }>;
    overflow: string[];
  },
): Promise<void> {
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, clients(name, agency, chat_webhook_url)')
    .eq('id', dropId)
    .single<{
      id: string;
      clients: { name: string; agency: string | null; chat_webhook_url: string | null } | null;
    }>();
  if (!drop) return;

  const clientName = drop.clients?.name ?? 'Client';
  const targetWebhookUrl = await resolveTeamChatWebhook(admin, {
    primaryUrl: drop.clients?.chat_webhook_url ?? null,
    agency: drop.clients?.agency ?? null,
  });
  if (!targetWebhookUrl) return;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago',
    });

  const moveLines = result.moves
    .map((m) => {
      const tag = m.doubledUp ? ' (doubled up, month full)' : '';
      return `• was ${fmt(m.oldScheduledAt)} → now ${fmt(m.newScheduledAt)}${tag}`;
    })
    .join('<br>');

  const widgets: ChatCardWidget[] = [
    {
      type: 'text',
      text: `Late approval triggered past-due reshuffling. Cortex auto-rescheduled <b>${result.moves.length}</b> post(s). The client wasn't emailed about the new times.`,
    },
  ];
  if (moveLines) {
    widgets.push({ type: 'text', text: moveLines });
  }
  if (result.overflow.length > 0) {
    widgets.push({
      type: 'text',
      text: `⚠️ <b>${result.overflow.length}</b> post(s) couldn't fit in this month and were left at their original time. Manual reschedule needed.`,
    });
  }

  postToGoogleChatSafe(
    targetWebhookUrl,
    buildChatCard({
      cardId: `past-due-fixup-${dropId}`,
      headerTitle: '⏰ Past-due reshuffling (internal)',
      headerSubtitle: clientName,
      sections: [{ widgets }],
      fallbackText:
        `⏰ ${clientName} — auto-rescheduled ${result.moves.length} post(s).` +
        (result.overflow.length > 0 ? ` ${result.overflow.length} overflow.` : ''),
    }),
    `past-due-fixup ${dropId}`,
  );
}

async function fireAllApprovedNotifications(
  admin: ReturnType<typeof createAdminClient>,
  dropId: string,
  shareToken: string,
  postCount: number,
): Promise<void> {
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, client_id, start_date, clients(name, agency, chat_webhook_url)')
    .eq('id', dropId)
    .single<{
      id: string;
      client_id: string | null;
      start_date: string;
      clients: { name: string; agency: string | null; chat_webhook_url: string | null } | null;
    }>();
  if (!drop) return;

  const clientName = drop.clients?.name ?? 'Client';
  const targetWebhookUrl = await resolveTeamChatWebhook(admin, {
    primaryUrl: drop.clients?.chat_webhook_url ?? null,
    agency: drop.clients?.agency ?? null,
  });
  const appBase = getCortexAppUrl(getBrandFromAgency(drop.clients?.agency ?? null));
  const shareUrl = `${appBase}/s/${shareToken}`;
  const downloadUrl = `${appBase}/c/${shareToken}/download`;

  if (targetWebhookUrl) {
    postToGoogleChatSafe(
      targetWebhookUrl,
      buildChatCard({
        cardId: `all-approved-${dropId}`,
        headerTitle: `🎉 All ${postCount} posts approved`,
        headerSubtitle: clientName,
        sections: [
          {
            widgets: [
              {
                type: 'text',
                text: 'Client used the <b>Approve all</b> button on this calendar. Posts will publish on their scheduled times. No team action needed.',
              },
              { type: 'button', text: 'Open calendar', url: shareUrl, filled: true },
            ],
          },
        ],
        fallbackText: `🎉 ${clientName} — approve-all (${postCount} posts). ${shareUrl}`,
      }),
      `all-approved ${dropId}`,
    );
  }

  // Paid-media (ads team) ping. NAT-66: prefer the per-client webhook
  // column over the legacy hard-coded map. The Monday folder enrichment
  // only runs when we resolved via the legacy map, since that's the
  // path that depends on Monday for the items board anyway.
  const paidMedia = await resolvePaidMediaWebhook(admin, {
    clientId: drop.client_id,
    clientName,
  });
  if (!paidMedia) return;

  if (paidMedia.source === 'legacy_map' && isMondayConfigured()) {
    const groupTitle = groupTitleForCalendarStart(drop.start_date);
    const item = await findContentCalendarItem(clientName, groupTitle);
    const folder = item?.editedVideosFolderUrl;
    const widgets: ChatCardWidget[] = [
      {
        type: 'text',
        text: 'Client approved every post on this calendar. Creatives are cleared to run as Meta ads.',
      },
    ];
    if (folder) {
      widgets.push({ type: 'button', text: 'Open edited videos folder', url: folder, filled: true });
    } else {
      widgets.push({
        type: 'text',
        text: '<i>Edited videos folder link is not set in Monday — pull assets manually.</i>',
      });
    }
    postToGoogleChatSafe(
      paidMedia.url,
      buildChatCard({
        cardId: `paid-media-legacy-approve-all-${dropId}`,
        headerTitle: '🎬 Approved for Meta ads',
        headerSubtitle: clientName,
        sections: [{ widgets }],
      }),
      `paid-media-approved ${clientName}`,
    );
    return;
  }

  postToGoogleChatSafe(
    paidMedia.url,
    buildChatCard({
      cardId: `paid-media-db-approve-all-${dropId}`,
      headerTitle: '🎬 Approved for Meta ads',
      headerSubtitle: clientName,
      sections: [
        {
          widgets: [
            {
              type: 'text',
              text: 'Client approved every post on this calendar. Creatives are cleared to run as Meta ads.',
            },
            { type: 'button', text: 'Download all assets', url: downloadUrl, filled: true },
          ],
        },
      ],
    }),
    `paid-media-approved ${clientName}`,
  );
}
