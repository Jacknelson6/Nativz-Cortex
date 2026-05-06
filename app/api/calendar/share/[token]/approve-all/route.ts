import { NextResponse, after } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { publishScheduledPost } from '@/lib/calendar/schedule-drop';
import { consumeForApproval } from '@/lib/credits/comment-hooks';
import {
  findContentCalendarItem,
  groupTitleForCalendarStart,
  syncMondayApprovalForDrop,
} from '@/lib/monday/calendar-approval';
import { isClientPaidMedia } from '@/lib/monday/paid-media';
import { isMondayConfigured } from '@/lib/monday/client';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';
import { getCalendarTeamWebhook } from '@/lib/chat/calendar-team-webhooks';
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

  const reviewLinkMap = link.post_review_link_map ?? {};
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

  // Targets: posts whose latest live status is NOT 'approved'. Mirrors
  // `app/c/[token]/page.tsx:284`: pending and revising both count.
  const targets: Array<{ postId: string; reviewLinkId: string }> = [];
  for (const [postId, reviewLinkId] of reviewLinkEntries) {
    const status = latestLiveStatus(commentsByReviewLink.get(reviewLinkId) ?? []);
    if (status !== 'approved') {
      targets.push({ postId, reviewLinkId });
    }
  }

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

async function fireAllApprovedNotifications(
  admin: ReturnType<typeof createAdminClient>,
  dropId: string,
  shareToken: string,
  postCount: number,
): Promise<void> {
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, start_date, clients(name, agency, chat_webhook_url)')
    .eq('id', dropId)
    .single<{
      id: string;
      start_date: string;
      clients: { name: string; agency: string | null; chat_webhook_url: string | null } | null;
    }>();
  if (!drop) return;

  const clientName = drop.clients?.name ?? 'Client';
  const chatWebhookUrl = await resolveTeamChatWebhook(admin, {
    primaryUrl: drop.clients?.chat_webhook_url ?? null,
    agency: drop.clients?.agency ?? null,
  });
  const opsWebhookUrl = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  const targetWebhookUrl = chatWebhookUrl ?? opsWebhookUrl;
  const shareUrl = `${getCortexAppUrl(getBrandFromAgency(drop.clients?.agency ?? null))}/s/${shareToken}`;

  if (targetWebhookUrl) {
    const text = `🎉 All ${postCount} posts in ${clientName}'s calendar are approved.\n${shareUrl}`;
    postToGoogleChatSafe(targetWebhookUrl, { text }, `all-approved ${dropId}`);
  }

  if (!isMondayConfigured()) return;
  const isPaidMedia = await isClientPaidMedia(clientName);
  if (!isPaidMedia) return;
  const teamWebhook = getCalendarTeamWebhook(clientName);
  if (!teamWebhook) {
    console.warn(`No team chat webhook mapped for ${clientName}`);
    return;
  }
  const groupTitle = groupTitleForCalendarStart(drop.start_date);
  const item = await findContentCalendarItem(clientName, groupTitle);
  const folder = item?.editedVideosFolderUrl;
  const folderLine = folder ? folder : '(edited videos folder link not set in Monday)';
  const text = `Hey all, content from ${clientName} is now approved: ${folderLine}`;
  postToGoogleChatSafe(teamWebhook.url, { text }, `paid-media-approved ${clientName}`);
}
