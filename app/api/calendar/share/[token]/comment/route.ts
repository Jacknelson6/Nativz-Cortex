import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications/create';
import { publishScheduledPost } from '@/lib/calendar/schedule-drop';
import { reschedulePastDueDrafts } from '@/lib/calendar/reschedule-past-due';
import {
  buildChatCard,
  postToGoogleChatSafe,
  type ChatCardWidget,
} from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { formatPostTimeForChat } from '@/lib/chat/format-post-time';
import { isMondayConfigured } from '@/lib/monday/client';
import {
  findContentCalendarItem,
  groupTitleForCalendarStart,
  syncMondayApprovalForDrop,
} from '@/lib/monday/calendar-approval';
import { resolvePaidMediaWebhook } from '@/lib/chat/resolve-paid-media-webhook';
import { getClientNotificationSetting } from '@/lib/notifications/get-client-setting';
import {
  consumeForApproval,
  hasPriorApproval,
  refundForUnapproval,
} from '@/lib/credits/comment-hooks';

const AttachmentSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1).max(200),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.number().int().nonnegative(),
});

const BodySchema = z
  .object({
    postId: z.string().uuid(),
    authorName: z.string().min(1).max(80),
    // Content can be empty when the user is submitting attachment-only
    // feedback ("here's a reference image, no notes needed"). The refine
    // below enforces that *something* is present — either text or files.
    content: z.string().max(2000).default(''),
    status: z.enum(['approved', 'changes_requested', 'comment']),
    attachments: z.array(AttachmentSchema).max(10).optional(),
    // Optional anchor — when present, the player will seek here on click.
    // Capped at 24h to keep the column NUMERIC(10,3) safe and stay within
    // sane short-form video bounds. Negative values rejected.
    timestampSeconds: z.number().min(0).max(86400).nullable().optional(),
  })
  .refine(
    (v) => v.content.trim().length > 0 || (v.attachments?.length ?? 0) > 0,
    { message: 'comment must have text or at least one attachment', path: ['content'] },
  );

const DeleteSchema = z.object({
  commentId: z.string().uuid(),
});

const PatchSchema = z.object({
  commentId: z.string().uuid(),
  resolved: z.boolean(),
});

/**
 * Detect natural-language approval inside a "comment" / "changes_requested"
 * payload. Some clients submit the revision form with text like "approved" or
 * "love this, change nothing" — the smart move is to treat those as an
 * approval rather than a vague request for changes.
 *
 * Heuristic:
 *   1. Trimmed message must be ≤80 chars (long, nuanced messages are not
 *      blanket approvals).
 *   2. Must match an approval phrase.
 *   3. Must not contain a hedging conjunction ("but", "however", …) that
 *      signals a follow-up request.
 *
 * Conservative on purpose. Better to miss a fuzzy approval than to publish a
 * post the client wanted to tweak.
 */
function looksLikeApproval(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 80) return false;
  const APPROVAL_RE =
    /\b(approved?|approving|lgtm|sgtm|ship ?it|good to go|all good|love (this|it|them)|nothing to change|change nothing|no (changes?|edits|notes|revisions?)|leave (as is|it)|perfect|looks (good|great|amazing|perfect|fantastic)|sounds (good|great)|green ?light)\b/i;
  if (!APPROVAL_RE.test(trimmed)) return false;
  if (/\b(but|except|however|though|other than|aside from)\b/i.test(trimmed)) return false;
  return true;
}

const TITLE_BY_STATUS: Record<'approved' | 'changes_requested' | 'comment', (a: string, c: string) => string> = {
  approved: (a, c) => `${a} approved a post in ${c}`,
  changes_requested: (a, c) => `${a} requested changes in ${c}`,
  comment: (a, c) => `${a} left a comment on ${c}`,
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, post_review_link_map, expires_at')
    .eq('token', token)
    .single<{ id: string; drop_id: string; post_review_link_map: Record<string, string>; expires_at: string }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const reviewLinkMap = link.post_review_link_map ?? {};
  const reviewLinkId = reviewLinkMap[parsed.data.postId];
  if (!reviewLinkId) {
    return NextResponse.json({ error: 'post is not part of this share link' }, { status: 400 });
  }

  // Smart approval: if the user submitted via "Add revision" (or as a plain
  // comment) but the body reads like an approval, upgrade the status. We
  // attach a metadata flag so the audit trail still shows it was inferred,
  // not a button-press, and the public UI can surface that nuance.
  const submittedStatus = parsed.data.status;
  const trimmedContent = parsed.data.content.trim();
  const inferredApproval =
    submittedStatus !== 'approved' && looksLikeApproval(trimmedContent);
  const finalStatus: 'approved' | 'changes_requested' | 'comment' = inferredApproval
    ? 'approved'
    : submittedStatus;
  const insertMetadata: Record<string, unknown> = inferredApproval
    ? { auto_approved: true, original_status: submittedStatus }
    : {};

  // Only honor a timestamp on plain comments and change requests — anchoring
  // an "approved" stamp to a specific moment doesn't carry meaning.
  const timestampSeconds =
    finalStatus === 'comment' || finalStatus === 'changes_requested'
      ? parsed.data.timestampSeconds ?? null
      : null;

  // Phase D soft-block (scope_exhausted 402 + PreApprovalModal) was removed.
  // Clients should never see a "you're out of edited videos" pop-up. Approvals
  // always write through; over-scope accounting stays an internal concern.

  const { data, error } = await admin
    .from('post_review_comments')
    .insert({
      review_link_id: reviewLinkId,
      author_name: parsed.data.authorName.trim(),
      content: trimmedContent,
      status: finalStatus,
      attachments: parsed.data.attachments ?? [],
      metadata: insertMetadata,
      timestamp_seconds: timestampSeconds,
    })
    .select('id, review_link_id, author_name, content, status, created_at, attachments, metadata, timestamp_seconds')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'failed' }, { status: 500 });
  }

  // Run notifications + Monday sync + Zernio publish AFTER the response.
  // `after()` keeps the function alive past the response on Vercel, so
  // multi-step work (Monday writeback, Zernio publish) doesn't get cut off
  // mid-flight. Bare fire-and-forget would race against serverless shutdown —
  // that's how the Monday sync was silently dropping while chat 🎉 messages
  // still landed.
  after(async () => {
    try {
      await notifyAdminsOfComment(admin, link.id, link.drop_id, token, reviewLinkMap, {
        postId: parsed.data.postId,
        authorName: parsed.data.authorName.trim(),
        content: trimmedContent,
        status: finalStatus,
        attachments: parsed.data.attachments ?? [],
      });
    } catch (err) {
      console.error('Comment notification failed:', err);
    }

    // Recompute drop-level approval state and push to Monday. State-derived
    // (not event-driven), so a single approval that doesn't yet make
    // everything approved still leaves Monday at "Waiting on approval", and
    // the next event re-syncs.
    try {
      await syncMondayApprovalForDrop(admin, link.drop_id);
    } catch (err) {
      console.error('Monday calendar approval sync failed:', err);
    }

    if (finalStatus === 'approved') {
      // Past-due fixup: shift this draft to a gap in the current month if its
      // original scheduled_at has already passed. Mirrors the bulk-approve
      // path so single-comment approvals get the same protection.
      let pastDueResult: Awaited<ReturnType<typeof reschedulePastDueDrafts>> | null = null;
      try {
        pastDueResult = await reschedulePastDueDrafts(admin, [parsed.data.postId]);
      } catch (err) {
        console.error(`Past-due fixup failed for post ${parsed.data.postId}:`, err);
      }

      // publishScheduledPost is idempotent (returns alreadyPublished=true if
      // already scheduled), so re-approval / multiple approvers won't double-post.
      try {
        await publishScheduledPost(admin, parsed.data.postId);
      } catch (err) {
        console.error(`Approval → Zernio publish failed for post ${parsed.data.postId}:`, err);
      }

      // Jack-only ping if we shifted the post. Posted to the client's chat
      // webhook (or agency catchall / OPS fallback). Never goes to the client.
      if (pastDueResult && (pastDueResult.moves.length > 0 || pastDueResult.overflow.length > 0)) {
        try {
          await notifyPastDueFixup(admin, link.drop_id, pastDueResult);
        } catch (err) {
          console.error('Past-due fixup notification failed:', err);
        }
      }

      // Approval-as-consumption: 1 credit per approved video. State-based
      // dedup in consume_credit makes re-approval (delete+approve) safe.
      await consumeForApproval(admin, {
        scheduledPostId: parsed.data.postId,
        shareLinkId: link.id,
        reviewerName: parsed.data.authorName.trim(),
        reviewLinkId,
      });
    } else if (finalStatus === 'changes_requested') {
      // Silent-overcharge fix: if this post was already approved earlier
      // and the reviewer is now requesting changes, refund the prior
      // consume. refund_credit is a no-op if there's nothing to refund,
      // but we guard with hasPriorApproval to avoid an extra round-trip
      // on the common (no-prior-approval) path.
      const prior = await hasPriorApproval(admin, reviewLinkId);
      if (prior) {
        await refundForUnapproval(admin, {
          scheduledPostId: parsed.data.postId,
          reason: 'changes_requested after prior approval',
        });
      }
    }
  });

  return NextResponse.json({ comment: data });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, post_review_link_map, expires_at')
    .eq('token', token)
    .single<{ id: string; drop_id: string; post_review_link_map: Record<string, string>; expires_at: string }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const { data: comment } = await admin
    .from('post_review_comments')
    .select('id, review_link_id, status')
    .eq('id', parsed.data.commentId)
    .single<{ id: string; review_link_id: string; status: string }>();
  if (!comment) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const allowedReviewIds = new Set(Object.values(link.post_review_link_map ?? {}));
  if (!allowedReviewIds.has(comment.review_link_id)) {
    return NextResponse.json({ error: 'comment is not part of this share link' }, { status: 400 });
  }

  const { error: delErr } = await admin
    .from('post_review_comments')
    .delete()
    .eq('id', comment.id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Only approval deletions affect the Monday-side state ("Client approved" →
  // "Waiting on approval"). Other history rows (caption_edit, tag_edit,
  // schedule_change, video_revised, plain comments) are pure audit trail —
  // skip the sync to avoid a needless Monday round-trip.
  if (comment.status === 'approved') {
    // Clear the all-approved dedup stamp so a future re-approval can fire the
    // celebration ping again. Only clear when this calendar was previously
    // fully approved (otherwise the stamp is already null).
    await admin
      .from('content_drop_share_links')
      .update({ all_approved_notified_at: null })
      .eq('id', link.id);

    // Reverse the post_id → review_link_id map to find the post tied to
    // this deleted approval. Needed for the credit refund (resolveChargeUnit
    // takes a scheduled_post_id).
    const reviewLinkMap = link.post_review_link_map ?? {};
    const reversedPostId = Object.entries(reviewLinkMap).find(
      ([, reviewId]) => reviewId === comment.review_link_id,
    )?.[0];

    after(async () => {
      try {
        await syncMondayApprovalForDrop(admin, link.drop_id);
      } catch (err) {
        console.error('Monday calendar approval sync failed (delete):', err);
      }

      // Approval revoked → refund the consume row. State-based dedup
      // makes this a no-op if the consume was already refunded (e.g. by
      // an earlier changes_requested-after-approval). Skips silently if
      // we somehow can't reverse-map the post id.
      if (reversedPostId) {
        await refundForUnapproval(admin, {
          scheduledPostId: reversedPostId,
          reason: 'approval comment deleted',
        });
      }
    });
  }

  return NextResponse.json({ ok: true, commentId: comment.id });
}

/**
 * Toggle the "resolved" flag on a `changes_requested` history row. Editors
 * use this to mark a revision request as handled — the icon flips from a
 * warning to a green check and the label changes to "Revised". Stored as a
 * metadata flag rather than a status change so the comment still threads
 * correctly with other change-request rows in the audit trail.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, post_review_link_map, expires_at, revisions_complete_notified_at')
    .eq('token', token)
    .single<{
      id: string;
      drop_id: string;
      post_review_link_map: Record<string, string>;
      expires_at: string;
      revisions_complete_notified_at: string | null;
    }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const { data: comment } = await admin
    .from('post_review_comments')
    .select('id, review_link_id, status, metadata')
    .eq('id', parsed.data.commentId)
    .single<{ id: string; review_link_id: string; status: string; metadata: Record<string, unknown> | null }>();
  if (!comment) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const allowedReviewIds = new Set(Object.values(link.post_review_link_map ?? {}));
  if (!allowedReviewIds.has(comment.review_link_id)) {
    return NextResponse.json({ error: 'comment is not part of this share link' }, { status: 400 });
  }
  if (comment.status !== 'changes_requested') {
    return NextResponse.json(
      { error: 'only revision requests can be marked resolved' },
      { status: 400 },
    );
  }

  const existing = comment.metadata ?? {};
  const nextMetadata: Record<string, unknown> = parsed.data.resolved
    ? { ...existing, resolved: true, resolved_at: new Date().toISOString() }
    : { ...existing, resolved: false, resolved_at: null };

  const { data: updated, error } = await admin
    .from('post_review_comments')
    .update({ metadata: nextMetadata })
    .eq('id', comment.id)
    .select('id, review_link_id, author_name, content, status, created_at, attachments, metadata, timestamp_seconds')
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'failed' }, { status: 500 });
  }

  // After the toggle: figure out whether this transition completed the
  // revision pass for the entire share link. We only fire the "all
  // revisions ready — please re-review" notification when the unresolved
  // count goes from N>0 to 0, and we dedup via
  // `revisions_complete_notified_at` so toggling doesn't spam the client.
  // If the editor un-marks one (unresolved goes from 0 → 1), we clear the
  // dedup stamp so a future completion fires again.
  after(async () => {
    try {
      await maybeFireRevisionsCompleteNotification(admin, {
        linkId: link.id,
        dropId: link.drop_id,
        token,
        reviewIds: Array.from(allowedReviewIds),
        previouslyNotifiedAt: link.revisions_complete_notified_at,
      });
    } catch (err) {
      console.error('revisions-complete notify check failed:', err);
    }
  });

  return NextResponse.json({ comment: updated });
}

/**
 * Server-side detector + notifier for the "all revisions ready" event.
 *
 * Fires after the editor toggles a `changes_requested` comment's resolved
 * flag. Counts unresolved revision requests across every post in this share
 * link's `post_review_link_map` and:
 *
 *   - If unresolved === 0 and the link wasn't already notified, posts the
 *     wrap-up chat ping ("All revisions complete on <client> — please
 *     re-review") to the client's Google Chat webhook and stamps
 *     `revisions_complete_notified_at` so we don't double-fire.
 *   - If unresolved > 0 and the link WAS previously notified, clears the
 *     stamp so the next completion fires again.
 *
 * Total >= 1 guard prevents firing on a share link that never had any
 * revision requests in the first place — we only want this for actually-
 * worked-through revisions.
 */
async function maybeFireRevisionsCompleteNotification(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    linkId: string;
    dropId: string;
    token: string;
    reviewIds: string[];
    previouslyNotifiedAt: string | null;
  },
) {
  if (args.reviewIds.length === 0) return;

  const { data: changeRows } = await admin
    .from('post_review_comments')
    .select('id, metadata')
    .in('review_link_id', args.reviewIds)
    .eq('status', 'changes_requested');

  const total = changeRows?.length ?? 0;
  if (total === 0) return; // Never had revisions — nothing to wrap up.

  const unresolved = (changeRows ?? []).filter((c) => {
    const m = (c.metadata ?? {}) as Record<string, unknown>;
    return m.resolved !== true;
  }).length;

  if (unresolved > 0) {
    // Editor un-marked something — reset dedup so a future completion fires.
    if (args.previouslyNotifiedAt) {
      await admin
        .from('content_drop_share_links')
        .update({ revisions_complete_notified_at: null })
        .eq('id', args.linkId);
    }
    return;
  }

  // unresolved === 0 — but skip if we've already pinged for this link.
  if (args.previouslyNotifiedAt) return;

  // Look up the client + chat webhook so we can route the ping.
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, clients(name, agency, chat_webhook_url)')
    .eq('id', args.dropId)
    .single<{
      id: string;
      clients: { name: string; agency: string | null; chat_webhook_url: string | null } | null;
    }>();

  const clientName = drop?.clients?.name ?? 'Client';
  const chatWebhookUrl = await resolveTeamChatWebhook(admin, {
    primaryUrl: drop?.clients?.chat_webhook_url ?? null,
    agency: drop?.clients?.agency ?? null,
  });
  const shareUrl = `${getCortexAppUrl(getBrandFromAgency(drop?.clients?.agency ?? null))}/s/${args.token}`;

  if (chatWebhookUrl) {
    // Internal-only ping. The email to the client only goes out when an
    // admin hits *Notify* in the share-history panel (calls /notify-
    // revisions).
    postToGoogleChatSafe(
      chatWebhookUrl,
      buildChatCard({
        cardId: `revisions-complete-${args.linkId}`,
        headerTitle: '✅ Revisions resolved (internal)',
        headerSubtitle: clientName,
        sections: [
          {
            widgets: [
              {
                type: 'text',
                text: 'Editor marked every revision request as resolved. The client has <b>not</b> been emailed yet.',
              },
              {
                type: 'text',
                text: 'QA the new cuts, then hit <b>Notify</b> in the share history to email them.',
              },
              { type: 'button', text: 'Open share history', url: shareUrl, filled: true },
            ],
          },
        ],
        fallbackText: `✅ Editor resolved every revision on ${clientName}. QA then notify. ${shareUrl}`,
      }),
      `revisions-complete ${args.linkId}`,
    );
  }

  await admin
    .from('content_drop_share_links')
    .update({ revisions_complete_notified_at: new Date().toISOString() })
    .eq('id', args.linkId);
}

async function notifyAdminsOfComment(
  admin: ReturnType<typeof createAdminClient>,
  shareLinkId: string,
  dropId: string,
  shareToken: string,
  reviewLinkMap: Record<string, string>,
  comment: {
    postId: string;
    authorName: string;
    content: string;
    status: 'approved' | 'changes_requested' | 'comment';
    attachments: Array<{ url: string; filename: string; mime_type: string; size_bytes: number }>;
  },
) {
  // Fetch drop + the specific post + share-link name in parallel. The post's
  // `scheduled_at` is surfaced in the chat message body so reviewers can see
  // *which* post the change request / comment / approval is about without
  // opening the link. The share-link's `name` is the admin-facing project
  // title surfaced on the celebration ping ("All N posts from Acme's
  // April Refresh project are approved!").
  const reviewLinkPostIds = Object.keys(reviewLinkMap);
  const [dropRes, postRes, linkRes, allPostsRes] = await Promise.all([
    admin
      .from('content_drops')
      .select('id, client_id, start_date, clients(name, agency, chat_webhook_url)')
      .eq('id', dropId)
      .single<{
        id: string;
        client_id: string | null;
        start_date: string;
        clients: { name: string; agency: string | null; chat_webhook_url: string | null } | null;
      }>(),
    admin
      .from('scheduled_posts')
      .select('scheduled_at')
      .eq('id', comment.postId)
      .maybeSingle<{ scheduled_at: string | null }>(),
    admin
      .from('content_drop_share_links')
      .select('name')
      .eq('id', shareLinkId)
      .maybeSingle<{ name: string | null }>(),
    reviewLinkPostIds.length > 0
      ? admin
          .from('scheduled_posts')
          .select('id, scheduled_at')
          .in('id', reviewLinkPostIds)
      : Promise.resolve({ data: [] as Array<{ id: string; scheduled_at: string | null }> }),
  ]);
  const drop = dropRes.data;
  if (!drop) return;
  const linkName = linkRes.data?.name?.trim() ?? '';

  const clientName = drop.clients?.name ?? 'Client';
  const chatWebhookUrl = await resolveTeamChatWebhook(admin, {
    primaryUrl: drop.clients?.chat_webhook_url ?? null,
    agency: drop.clients?.agency ?? null,
  });
  const postScheduledAt = postRes.data?.scheduled_at ?? null;
  const postTimeLine = postScheduledAt ? formatPostTimeForChat(postScheduledAt) : null;
  const title = TITLE_BY_STATUS[comment.status](comment.authorName, clientName);
  // Truncate only the in-app notification body — chat gets full content.
  // Attachment-only comments have no text, so fall back to a file summary.
  const preview = comment.content.trim()
    ? comment.content.slice(0, 140) + (comment.content.length > 140 ? '…' : '')
    : comment.attachments.length === 1
      ? `📎 ${comment.attachments[0].filename}`
      : `📎 ${comment.attachments.length} files attached`;
  // In-app links go to the admin view; chat links go to the public share view
  // so phones (mobile-blocked from /admin/*) can open them.
  const linkPath = `/admin/calendar/${drop.id}`;
  // Compute the index of the commented-on post within the share link's
  // sorted list so the chat link can deep-link to it via `#post-N`.
  // Mirrors `sortPostsForList` on the public page: scheduled_at ASC,
  // nulls first, fall back to id for stability.
  const allPosts = (allPostsRes.data ?? []) as Array<{ id: string; scheduled_at: string | null }>;
  const sortedPostIds = [...allPosts]
    .sort((a, b) => {
      const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : -Infinity;
      const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : -Infinity;
      if (aTime !== bTime) return aTime - bTime;
      return a.id.localeCompare(b.id);
    })
    .map((p) => p.id);
  const postIndex = sortedPostIds.indexOf(comment.postId);
  const postAnchor = postIndex >= 0 ? `#post-${postIndex + 1}` : '';
  const appBase = getCortexAppUrl(getBrandFromAgency(drop.clients?.agency ?? null));
  const baseShareUrl = `${appBase}/s/${shareToken}`;
  const shareUrl = `${baseShareUrl}${postAnchor}`;
  // Paid-media team gets the dedicated download grid instead of the full
  // review page — they only need to grab the assets, not browse captions.
  const downloadUrl = `${appBase}/c/${shareToken}/download`;

  // In-app: every admin user gets the bell ping. Was previously hard-coded
  // to jack@nativz.io, which meant no other editor on the team saw revision
  // requests / approvals show up in the app — they had to be in the right
  // Google Chat space, and if the client had no chat_webhook_url they got
  // nothing at all. We pull `role='admin'` from `users` so the recipient
  // list grows automatically as new editors join the team.
  const { data: adminUsers } = await admin
    .from('users')
    .select('id')
    .eq('role', 'admin');
  for (const adminUser of adminUsers ?? []) {
    const recipientId = (adminUser as { id: string }).id;
    createNotification({
      recipientUserId: recipientId,
      type: 'general',
      title,
      body: preview,
      linkPath,
    }).catch(() => {});
  }

  // For approved-status events, claim the right to send the all-approved
  // notifications atomically. Two concurrent approvers (or a single
  // double-click) used to both pass a non-atomic "did everyone approve?"
  // SELECT and post the celebration twice. Now: only the request that flips
  // all_approved_notified_at NULL → timestamp wins and posts. The DELETE
  // handler clears the stamp when an approval is removed, so re-approval can
  // fire the ping again.
  let allApprovedClaim: 'won' | 'lost' | 'not-yet' = 'not-yet';
  if (comment.status === 'approved') {
    const allApproved = await checkAllApproved(admin, reviewLinkMap);
    if (allApproved) {
      const { data: claimed } = await admin
        .from('content_drop_share_links')
        .update({ all_approved_notified_at: new Date().toISOString() })
        .eq('id', shareLinkId)
        .is('all_approved_notified_at', null)
        .select('id')
        .maybeSingle();
      allApprovedClaim = claimed ? 'won' : 'lost';
    }
  }

  // Google Chat: per-client space when set, otherwise the agency's
  // miscellaneous-catchall client (resolved inside `resolveTeamChatWebhook`).
  // Client-comment notifications never fall back to OPS — that space is
  // reserved for system-level alerts (cron failures, post-health). Brands
  // without a per-client webhook AND no agency catchall silently no-op.
  // - comment / changes_requested → post immediately with full content + attachments
  // - approved → post 🎉 once every post in this share link is approved
  const targetWebhookUrl = chatWebhookUrl;
  if (targetWebhookUrl) {
    if (comment.status === 'comment' || comment.status === 'changes_requested') {
      const commentSetting = await getClientNotificationSetting(
        'calendar_comment_chat',
        'chat',
        drop.client_id,
      );
      if (commentSetting.enabled) {
        const verb = comment.status === 'changes_requested' ? 'requested changes' : 'commented';
        const emoji = comment.status === 'changes_requested' ? '✏️' : '💬';
        const trimmed = comment.content.trim();
        const widgets: ChatCardWidget[] = [];
        if (postTimeLine) {
          widgets.push({ type: 'kv', label: 'Post scheduled for', value: postTimeLine });
        }
        if (trimmed) {
          widgets.push({ type: 'quote', text: trimmed });
        }
        if (comment.attachments.length > 0) {
          widgets.push({
            type: 'kv',
            label: `Attachments (${comment.attachments.length})`,
            value: comment.attachments.map((a) => a.filename).join(', '),
          });
          widgets.push({
            type: 'buttons',
            buttons: comment.attachments.slice(0, 4).map((a) => ({
              text: a.filename.length > 32 ? `${a.filename.slice(0, 30)}…` : a.filename,
              url: a.url,
            })),
          });
        }
        widgets.push({ type: 'divider' });
        widgets.push({
          type: 'text',
          text: '<i>The client only gets an email once you reply from the share link.</i>',
        });
        widgets.push({
          type: 'button',
          text: comment.status === 'changes_requested' ? 'Open & reply' : 'Open share link',
          url: shareUrl,
          filled: true,
        });

        const fallback =
          `${emoji} ${comment.authorName} (client) ${verb} on ${clientName}` +
          (postTimeLine ? `\nPost scheduled for ${postTimeLine}` : '') +
          (trimmed ? `\n"${trimmed}"` : '') +
          `\n${shareUrl}`;

        postToGoogleChatSafe(
          targetWebhookUrl,
          buildChatCard({
            cardId: `calendar-comment-${comment.postId}-${Date.now()}`,
            headerTitle: `${emoji} ${comment.authorName} ${verb}`,
            headerSubtitle: clientName,
            sections: [{ widgets }],
            fallbackText: fallback,
          }),
          `comment ${dropId}`,
        );
      }
    } else if (allApprovedClaim === 'won') {
      const approvedSetting = await getClientNotificationSetting(
        'calendar_all_approved_chat',
        'chat',
        drop.client_id,
      );
      if (approvedSetting.enabled) {
        const reviewLinkIds = Object.values(reviewLinkMap);
        const subject = linkName
          ? `${clientName} · ${linkName}`
          : `${clientName}'s calendar`;
        postToGoogleChatSafe(
          targetWebhookUrl,
          buildChatCard({
            cardId: `all-approved-${dropId}`,
            headerTitle: `🎉 All ${reviewLinkIds.length} posts approved`,
            headerSubtitle: subject,
            sections: [
              {
                widgets: [
                  {
                    type: 'text',
                    text: 'Calendar is locked; posts will publish on their scheduled times. No team action needed.',
                  },
                  { type: 'button', text: 'Open calendar', url: shareUrl, filled: true },
                ],
              },
            ],
            fallbackText: `🎉 ${subject} — client approved all ${reviewLinkIds.length} posts. ${shareUrl}`,
          }),
          `all-approved ${dropId}`,
        );
      }
    }
  }

  // Paid-media team ping: gated on the same atomic claim so the team space
  // doesn't double-fire either.
  if (allApprovedClaim === 'won') {
    try {
      await pingPaidMediaTeam(admin, {
        clientId: drop.client_id,
        clientName,
        startDate: drop.start_date,
        shareUrl: downloadUrl,
      });
    } catch (err) {
      console.error('Paid-media team ping failed:', err);
    }
  }
}

/**
 * Ping the paid-media team's Google Chat space when a calendar gets the
 * all-clear. NAT-66: prefer per-client `clients.paid_media_webhook_url`
 * over the legacy hard-coded map. The Monday folder enrichment only runs
 * when we resolved via the legacy map, since that path needs Monday for
 * the items board anyway.
 */
async function pingPaidMediaTeam(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    clientId: string | null;
    clientName: string;
    startDate: string;
    shareUrl: string;
  },
): Promise<void> {
  const paidMediaSetting = await getClientNotificationSetting(
    'calendar_paid_media_chat',
    'chat',
    args.clientId,
  );
  if (!paidMediaSetting.enabled) return;
  const paidMedia = await resolvePaidMediaWebhook(admin, {
    clientId: args.clientId,
    clientName: args.clientName,
  });
  if (!paidMedia) return;

  if (paidMedia.source === 'legacy_map' && isMondayConfigured()) {
    const groupTitle = groupTitleForCalendarStart(args.startDate);
    const item = await findContentCalendarItem(args.clientName, groupTitle);
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
        cardId: `paid-media-legacy-${args.clientName}-${args.startDate}`,
        headerTitle: '🎬 Approved for Meta ads',
        headerSubtitle: args.clientName,
        sections: [{ widgets }],
      }),
      `paid-media-approved ${args.clientName}`,
    );
    return;
  }

  // DB-driven path: drop the ads team straight onto the dedicated
  // download grid (caller wires `args.shareUrl` to the /download URL) so
  // they can pull every approved asset in one click.
  postToGoogleChatSafe(
    paidMedia.url,
    buildChatCard({
      cardId: `paid-media-db-${args.clientName}-${args.startDate}`,
      headerTitle: '🎬 Approved for Meta ads',
      headerSubtitle: args.clientName,
      sections: [
        {
          widgets: [
            {
              type: 'text',
              text: 'Client approved every post on this calendar. Creatives are cleared to run as Meta ads.',
            },
            { type: 'button', text: 'Download all assets', url: args.shareUrl, filled: true },
          ],
        },
      ],
    }),
    `paid-media-approved ${args.clientName}`,
  );
}

async function checkAllApproved(
  admin: ReturnType<typeof createAdminClient>,
  reviewLinkMap: Record<string, string>,
): Promise<boolean> {
  const reviewLinkIds = Object.values(reviewLinkMap);
  if (reviewLinkIds.length === 0) return false;
  const { data: approvals } = await admin
    .from('post_review_comments')
    .select('review_link_id')
    .in('review_link_id', reviewLinkIds)
    .eq('status', 'approved');
  const approvedSet = new Set((approvals ?? []).map((a) => a.review_link_id));
  return reviewLinkIds.every((id) => approvedSet.has(id));
}

/**
 * Posts a Jack-only summary to the client's Google Chat webhook describing
 * any past-due posts that were shifted into the current month, plus overflow
 * posts that didn't fit. Never goes to the client. Silently no-ops if neither
 * a per-client webhook nor an agency misc-catchall is configured.
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

