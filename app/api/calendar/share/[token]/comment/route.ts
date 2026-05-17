import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getShareContextOrNull, resolveBoundIdentity } from '@/lib/share/identity';
import { notifyViewersOfShareEvent } from '@/lib/share/notify-viewers';
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
import { isMondayConfigured } from '@/lib/monday/client';
import {
  findContentCalendarItem,
  groupTitleForCalendarStart,
} from '@/lib/monday/calendar-approval';
import { resolvePaidMediaWebhook } from '@/lib/chat/resolve-paid-media-webhook';
import { getClientNotificationSetting } from '@/lib/notifications/get-client-setting';

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
    // Empty content is fine when the user is submitting attachment-only
    // feedback. The refine below enforces that *something* is present.
    content: z.string().max(2000).default(''),
    // Migration 322 collapsed `changes_requested` into `comment`. A comment
    // without `Approve` IS the revision request. `approved` still arrives
    // here as its own status row stamped by the Approve button.
    status: z.enum(['approved', 'comment']),
    attachments: z.array(AttachmentSchema).max(10).optional(),
    // Optional anchor, when present, the player will seek here on click.
    // Approvals ignore the field (the timestamp has no meaning on a state
    // flip), comments and replies honor it.
    timestampSeconds: z.number().min(0).max(86400).nullable().optional(),
    // Replies hang off any prior comment in the same review thread. Nesting
    // is unlimited at the data layer; the UI caps visual indent at depth 4.
    parentCommentId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (v) => v.content.trim().length > 0 || (v.attachments?.length ?? 0) > 0,
    { message: 'comment must have text or at least one attachment', path: ['content'] },
  );

const DeleteSchema = z.object({
  commentId: z.string().uuid(),
});

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

  const trimmedContent = parsed.data.content.trim();
  const submittedStatus = parsed.data.status;

  // Approvals never carry a timestamp anchor (a state flip has no moment).
  const timestampSeconds =
    submittedStatus === 'comment' ? parsed.data.timestampSeconds ?? null : null;

  // Parent validation: must be in the same review thread. Depth is otherwise
  // unrestricted; the UI flattens past visual depth 4.
  let parentCommentId: string | null = null;
  if (parsed.data.parentCommentId) {
    const { data: parent } = await admin
      .from('post_review_comments')
      .select('id, review_link_id')
      .eq('id', parsed.data.parentCommentId)
      .single<{ id: string; review_link_id: string }>();
    if (!parent || parent.review_link_id !== reviewLinkId) {
      return NextResponse.json(
        { error: 'parent comment not found on this post' },
        { status: 400 },
      );
    }
    parentCommentId = parent.id;
  }

  // Replies are always conversation. Approval pressed while replying still
  // posts the reply as a comment; the approval is a separate top-level row
  // stamped by the dedicated button.
  const persistedStatus: 'approved' | 'comment' =
    parentCommentId ? 'comment' : submittedStatus;

  // PRD 05: derive `author_role` + `author_user_id` from the bound session
  // (not from the client). Wrong-agency or anonymous sessions fall through
  // to 'guest' here; the gateway surfaces mismatches to the user.
  const shareContext = await getShareContextOrNull(token);
  let authorRole: 'admin' | 'viewer' | 'guest' = 'guest';
  let authorUserId: string | null = null;
  if (shareContext) {
    const { identity } = await resolveBoundIdentity(shareContext);
    if (identity) {
      authorUserId = identity.userId;
      authorRole =
        identity.role === 'admin' || identity.role === 'super_admin'
          ? 'admin'
          : identity.role === 'viewer'
            ? 'viewer'
            : 'guest';
    }
  }

  // Migration 322 collapsed `kind` to feedback | approval | video_revised.
  // Admin-vs-viewer distinction is derived from `author_role` at render time,
  // so there's no separate admin_response kind.
  const insertKind: 'feedback' | 'approval' =
    persistedStatus === 'approved' ? 'approval' : 'feedback';

  const { data, error } = await admin
    .from('post_review_comments')
    .insert({
      review_link_id: reviewLinkId,
      author_name: parsed.data.authorName.trim(),
      author_user_id: authorUserId,
      author_role: authorRole,
      content: trimmedContent,
      status: persistedStatus,
      kind: insertKind,
      attachments: parsed.data.attachments ?? [],
      metadata: {},
      timestamp_seconds: timestampSeconds,
      parent_comment_id: parentCommentId,
    })
    .select('id, review_link_id, author_name, author_user_id, author_role, content, status, kind, created_at, attachments, metadata, timestamp_seconds, parent_comment_id')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'failed' }, { status: 500 });
  }

  // After the response: viewer ping + approve-driven side effects only.
  // - Admin bell + Google Chat pings are DEFERRED to coalesce-review-pings.
  // - Monday writeback is gone (state doesn't roundtrip there anymore).
  // - Credit consume/refund is gone (the credit program is being replaced).
  after(async () => {
    // PRD 08: admin-authored events land in viewer portal bells. Viewer/
    // guest authored comments flow admin-direction only.
    if (authorRole === 'admin') {
      try {
        const { data: dropRow } = await admin
          .from('content_drops')
          .select('client_id, clients(name)')
          .eq('id', link.drop_id)
          .maybeSingle<{ client_id: string | null; clients: { name: string | null } | null }>();
        const brandLabel = dropRow?.clients?.name ?? 'your calendar';
        const title =
          persistedStatus === 'approved'
            ? `${parsed.data.authorName.trim()} approved a post on ${brandLabel}`
            : `${parsed.data.authorName.trim()} replied on ${brandLabel}`;
        const preview = trimmedContent
          ? trimmedContent.slice(0, 140) + (trimmedContent.length > 140 ? '…' : '')
          : '';
        await notifyViewersOfShareEvent({
          clientId: dropRow?.client_id ?? null,
          title,
          body: preview,
          linkPath: `/s/${token}`,
          type: 'feedback_received',
        });
      } catch (err) {
        console.error('Viewer notification (calendar) failed:', err);
      }
    }

    if (persistedStatus === 'approved') {
      // Past-due fixup: shift this draft into a current-month gap if its
      // original scheduled_at has already passed. Same protection the bulk
      // approve path gets.
      let pastDueResult: Awaited<ReturnType<typeof reschedulePastDueDrafts>> | null = null;
      try {
        pastDueResult = await reschedulePastDueDrafts(admin, [parsed.data.postId]);
      } catch (err) {
        console.error(`Past-due fixup failed for post ${parsed.data.postId}:`, err);
      }

      // publishScheduledPost is idempotent (returns alreadyPublished=true if
      // already scheduled), so re-approval won't double-post.
      try {
        await publishScheduledPost(admin, parsed.data.postId);
      } catch (err) {
        console.error(`Approval → Zernio publish failed for post ${parsed.data.postId}:`, err);
      }

      if (pastDueResult && (pastDueResult.moves.length > 0 || pastDueResult.overflow.length > 0)) {
        try {
          await notifyPastDueFixup(admin, link.drop_id, pastDueResult);
        } catch (err) {
          console.error('Past-due fixup notification failed:', err);
        }
      }

      // All-approved 🎉 ping is still single-shot, so we run it inline here
      // (atomic claim via all_approved_notified_at). Per-event admin bells
      // for the approval itself flow through the coalesce cron.
      try {
        await maybeFireAllApprovedPing(admin, {
          shareLinkId: link.id,
          dropId: link.drop_id,
          token,
          reviewLinkMap,
        });
      } catch (err) {
        console.error('All-approved ping failed:', err);
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

  // Clearing the all-approved dedup stamp lets a future re-approval fire the
  // celebration again. Other status rows (caption_edit, tag_edit, etc.) are
  // pure audit trail; nothing to undo.
  if (comment.status === 'approved') {
    await admin
      .from('content_drop_share_links')
      .update({ all_approved_notified_at: null })
      .eq('id', link.id);
  }

  return NextResponse.json({ ok: true, commentId: comment.id });
}

async function maybeFireAllApprovedPing(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    shareLinkId: string;
    dropId: string;
    token: string;
    reviewLinkMap: Record<string, string>;
  },
): Promise<void> {
  const allApproved = await checkAllApproved(admin, args.reviewLinkMap);
  if (!allApproved) return;

  // Atomic claim: only the request that flips NULL → timestamp wins. Two
  // concurrent approvers can't both fire the celebration.
  const { data: claimed } = await admin
    .from('content_drop_share_links')
    .update({ all_approved_notified_at: new Date().toISOString() })
    .eq('id', args.shareLinkId)
    .is('all_approved_notified_at', null)
    .select('id')
    .maybeSingle();
  if (!claimed) return;

  const [dropRes, linkRes] = await Promise.all([
    admin
      .from('content_drops')
      .select('id, client_id, start_date, clients(name, agency, chat_webhook_url)')
      .eq('id', args.dropId)
      .single<{
        id: string;
        client_id: string | null;
        start_date: string;
        clients: { name: string; agency: string | null; chat_webhook_url: string | null } | null;
      }>(),
    admin
      .from('content_drop_share_links')
      .select('name')
      .eq('id', args.shareLinkId)
      .maybeSingle<{ name: string | null }>(),
  ]);
  const drop = dropRes.data;
  if (!drop) return;
  const linkName = linkRes.data?.name?.trim() ?? '';
  const clientName = drop.clients?.name ?? 'Client';

  const chatWebhookUrl = await resolveTeamChatWebhook(admin, {
    primaryUrl: drop.clients?.chat_webhook_url ?? null,
    agency: drop.clients?.agency ?? null,
  });
  const appBase = getCortexAppUrl(getBrandFromAgency(drop.clients?.agency ?? null));
  const shareUrl = `${appBase}/s/${args.token}`;
  const downloadUrl = `${appBase}/c/${args.token}/download`;

  if (chatWebhookUrl) {
    const approvedSetting = await getClientNotificationSetting(
      'calendar_all_approved_chat',
      'chat',
      drop.client_id,
    );
    if (approvedSetting.enabled) {
      const reviewLinkIds = Object.values(args.reviewLinkMap);
      const subject = linkName ? `${clientName} · ${linkName}` : `${clientName}'s calendar`;
      postToGoogleChatSafe(
        chatWebhookUrl,
        buildChatCard({
          cardId: `all-approved-${args.dropId}`,
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
          fallbackText: `🎉 ${subject}, client approved all ${reviewLinkIds.length} posts. ${shareUrl}`,
        }),
        `all-approved ${args.dropId}`,
      );
    }
  }

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
        text: '<i>Edited videos folder link is not set in Monday, pull assets manually.</i>',
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
        `⏰ ${clientName}, auto-rescheduled ${result.moves.length} post(s).` +
        (result.overflow.length > 0 ? ` ${result.overflow.length} overflow.` : ''),
    }),
    `past-due-fixup ${dropId}`,
  );
}
