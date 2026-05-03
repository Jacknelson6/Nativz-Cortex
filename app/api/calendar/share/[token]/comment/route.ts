import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications/create';
import { publishScheduledPost } from '@/lib/calendar/schedule-drop';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { formatPostTimeForChat } from '@/lib/chat/format-post-time';
import { isMondayConfigured } from '@/lib/monday/client';
import {
  findContentCalendarItem,
  groupTitleForCalendarStart,
  syncMondayApprovalForDrop,
} from '@/lib/monday/calendar-approval';
import { isClientPaidMedia } from '@/lib/monday/paid-media';
import { getCalendarTeamWebhook } from '@/lib/chat/calendar-team-webhooks';
import {
  consumeForApproval,
  hasPriorApproval,
  refundForUnapproval,
} from '@/lib/credits/comment-hooks';
import { resolveChargeUnit } from '@/lib/credits/resolve-charge-unit';
import { getDeliverableTypeId } from '@/lib/deliverables/types-cache';
import { clientAllowsOverage } from '@/lib/deliverables/overage';

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

  // Soft-block on approval when the client is out of scope for this
  // deliverable type. The PRD calls today's silent-overage behavior the
  // bug. Block the approval (no comment insert, no consume) and return a
  // structured 402 so the share-link UI can render an "out of scope, add
  // one" CTA. Run only on `approved` so plain comments + change requests
  // still write through.
  if (finalStatus === 'approved') {
    const charge = await resolveChargeUnit(admin, {
      scheduledPostId: parsed.data.postId,
    });
    if (charge) {
      const { data: post } = await admin
        .from('scheduled_posts')
        .select('client_id')
        .eq('id', parsed.data.postId)
        .maybeSingle<{ client_id: string | null }>();
      const clientId = post?.client_id ?? null;
      if (clientId) {
        const deliverableTypeId = await getDeliverableTypeId(
          admin,
          charge.deliverableTypeSlug,
        );
        const { data: balanceRow } = await admin
          .from('client_credit_balances')
          .select('current_balance')
          .eq('client_id', clientId)
          .eq('deliverable_type_id', deliverableTypeId)
          .maybeSingle<{ current_balance: number }>();
        const remaining = balanceRow?.current_balance ?? 0;
        if (remaining <= 0) {
          const overageOk = await clientAllowsOverage(
            admin,
            clientId,
            deliverableTypeId,
          );
          if (!overageOk) {
            const appUrl =
              process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
            return NextResponse.json(
              {
                error: 'scope_exhausted',
                deliverable_type: charge.deliverableTypeSlug,
                remaining,
                addon_url: `${appUrl}/deliverables`,
              },
              { status: 402 },
            );
          }
        }
      }
    }
  }

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
      // publishScheduledPost is idempotent (returns alreadyPublished=true if
      // already scheduled), so re-approval / multiple approvers won't double-post.
      try {
        await publishScheduledPost(admin, parsed.data.postId);
      } catch (err) {
        console.error(`Approval → Zernio publish failed for post ${parsed.data.postId}:`, err);
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
    .select('id, clients(name, chat_webhook_url)')
    .eq('id', args.dropId)
    .single<{
      id: string;
      clients: { name: string; chat_webhook_url: string | null } | null;
    }>();

  const clientName = drop?.clients?.name ?? 'Client';
  const chatWebhookUrl = drop?.clients?.chat_webhook_url ?? null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const shareUrl = `${appUrl}/c/${args.token}`;

  if (chatWebhookUrl) {
    const text =
      `✅ All revisions are ready for *${clientName}*.\n` +
      `Take another look at the calendar and approve the ones that are good to go:\n${shareUrl}`;
    postToGoogleChatSafe(
      chatWebhookUrl,
      { text },
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
  // Fetch drop + the specific post in parallel — the post's `scheduled_at` is
  // surfaced in the chat message body so reviewers can see *which* post the
  // change request / comment / approval is about without opening the link.
  const [dropRes, postRes] = await Promise.all([
    admin
      .from('content_drops')
      .select('id, start_date, clients(name, chat_webhook_url)')
      .eq('id', dropId)
      .single<{
        id: string;
        start_date: string;
        clients: { name: string; chat_webhook_url: string | null } | null;
      }>(),
    admin
      .from('scheduled_posts')
      .select('scheduled_at')
      .eq('id', comment.postId)
      .maybeSingle<{ scheduled_at: string | null }>(),
  ]);
  const drop = dropRes.data;
  if (!drop) return;

  const clientName = drop.clients?.name ?? 'Client';
  const chatWebhookUrl = drop.clients?.chat_webhook_url ?? null;
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const shareUrl = `${appUrl}/c/${shareToken}`;

  // In-app: Jack only. Future: per-share-link recipient list.
  const { data: jack } = await admin
    .from('users')
    .select('id')
    .eq('email', 'jack@nativz.io')
    .maybeSingle<{ id: string }>();
  if (jack?.id) {
    createNotification({
      recipientUserId: jack.id,
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

  // Per-client Google Chat (collab space): driven by clients.chat_webhook_url.
  // - comment / changes_requested → post immediately with full content + attachments
  // - approved → post 🎉 once every post in this share link is approved
  if (chatWebhookUrl) {
    if (comment.status === 'comment' || comment.status === 'changes_requested') {
      const verb = comment.status === 'changes_requested' ? 'requested changes' : 'commented';
      const trimmed = comment.content.trim();
      // When the reviewer attaches files without typing anything, skip the
      // empty `> ` quote block so the message doesn't lead with a stray
      // dangling quote line.
      const quotedBlock = trimmed
        ? '\n' + trimmed.split('\n').map((line) => `> ${line}`).join('\n')
        : '';
      const attachmentBlock =
        comment.attachments.length > 0
          ? '\n\n' +
            comment.attachments.map((a) => `📎 ${a.filename}\n${a.url}`).join('\n\n')
          : '';
      // Show *which* post — by scheduled date/time — so the team can scan
      // the chat without opening the share link.
      const postLine = postTimeLine ? `\n_Post scheduled for ${postTimeLine}_` : '';
      const text = `*${comment.authorName}* ${verb} on ${clientName}:${postLine}${quotedBlock}${attachmentBlock}\n\n${shareUrl}`;
      postToGoogleChatSafe(chatWebhookUrl, { text }, `comment ${dropId}`);
    } else if (allApprovedClaim === 'won') {
      const reviewLinkIds = Object.values(reviewLinkMap);
      const text = `🎉 All ${reviewLinkIds.length} posts in ${clientName}'s calendar are approved.\n${shareUrl}`;
      postToGoogleChatSafe(chatWebhookUrl, { text }, `all-approved ${dropId}`);
    }
  }

  // Paid-media team ping: gated on the same atomic claim so the team space
  // doesn't double-fire either.
  if (allApprovedClaim === 'won') {
    try {
      await pingPaidMediaTeam(clientName, drop.start_date);
    } catch (err) {
      console.error('Paid-media team ping failed:', err);
    }
  }
}

/**
 * Ping the paid-media team's Google Chat space when a calendar gets the
 * all-clear. Sheet-driven webhook map; per-client gate from the Monday
 * Clients board "Paid Media" flag. Reuses the Monday item lookup to grab
 * the edited-videos folder URL for the message body.
 */
async function pingPaidMediaTeam(clientName: string, startDate: string): Promise<void> {
  if (!isMondayConfigured()) return;
  const isPaidMedia = await isClientPaidMedia(clientName);
  if (!isPaidMedia) return;

  const webhook = getCalendarTeamWebhook(clientName);
  if (!webhook) {
    console.warn(`No team chat webhook mapped for ${clientName}`);
    return;
  }

  const groupTitle = groupTitleForCalendarStart(startDate);
  const item = await findContentCalendarItem(clientName, groupTitle);
  const folder = item?.editedVideosFolderUrl;
  const folderLine = folder ? folder : '(edited videos folder link not set in Monday)';
  const text = `Hey all, content from ${clientName} is now approved: ${folderLine}`;
  postToGoogleChatSafe(webhook.url, { text }, `paid-media-approved ${clientName}`);
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

