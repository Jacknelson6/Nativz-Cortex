import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications/create';
import { publishScheduledPost } from '@/lib/calendar/schedule-drop';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';

const AttachmentSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1).max(200),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.number().int().nonnegative(),
});

const BodySchema = z.object({
  postId: z.string().uuid(),
  authorName: z.string().min(1).max(80),
  content: z.string().min(1).max(2000),
  status: z.enum(['approved', 'changes_requested', 'comment']),
  attachments: z.array(AttachmentSchema).max(10).optional(),
});

const DeleteSchema = z.object({
  commentId: z.string().uuid(),
});

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
    .select('drop_id, post_review_link_map, expires_at')
    .eq('token', token)
    .single<{ drop_id: string; post_review_link_map: Record<string, string>; expires_at: string }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const reviewLinkMap = link.post_review_link_map ?? {};
  const reviewLinkId = reviewLinkMap[parsed.data.postId];
  if (!reviewLinkId) {
    return NextResponse.json({ error: 'post is not part of this share link' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('post_review_comments')
    .insert({
      review_link_id: reviewLinkId,
      author_name: parsed.data.authorName.trim(),
      content: parsed.data.content.trim(),
      status: parsed.data.status,
      attachments: parsed.data.attachments ?? [],
    })
    .select('id, review_link_id, author_name, content, status, created_at, attachments')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'failed' }, { status: 500 });
  }

  // Fire-and-forget notifications. Don't block the comment response.
  notifyAdminsOfComment(admin, link.drop_id, reviewLinkMap, {
    authorName: parsed.data.authorName.trim(),
    content: parsed.data.content.trim(),
    status: parsed.data.status,
    attachments: parsed.data.attachments ?? [],
  }).catch((err) => console.error('Comment notification failed:', err));

  // Approval = "ship it". Hand the draft post to Zernio. publishScheduledPost
  // is idempotent (returns alreadyPublished=true if already scheduled), so
  // re-approval / multiple approvers won't double-post. Fire-and-forget so the
  // viewer's UI doesn't wait on the Zernio call.
  if (parsed.data.status === 'approved') {
    publishScheduledPost(admin, parsed.data.postId).catch((err) => {
      console.error(`Approval → Zernio publish failed for post ${parsed.data.postId}:`, err);
    });
  }

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
    .select('post_review_link_map, expires_at')
    .eq('token', token)
    .single<{ post_review_link_map: Record<string, string>; expires_at: string }>();
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

  if (comment.status !== 'approved') {
    return NextResponse.json({ error: 'only approvals can be removed via this endpoint' }, { status: 400 });
  }

  const { error: delErr } = await admin
    .from('post_review_comments')
    .delete()
    .eq('id', comment.id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, commentId: comment.id });
}

async function notifyAdminsOfComment(
  admin: ReturnType<typeof createAdminClient>,
  dropId: string,
  reviewLinkMap: Record<string, string>,
  comment: {
    authorName: string;
    content: string;
    status: 'approved' | 'changes_requested' | 'comment';
    attachments: Array<{ url: string; filename: string; mime_type: string; size_bytes: number }>;
  },
) {
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, clients(name, chat_webhook_url)')
    .eq('id', dropId)
    .single<{ id: string; clients: { name: string; chat_webhook_url: string | null } | null }>();
  if (!drop) return;

  const clientName = drop.clients?.name ?? 'Client';
  const chatWebhookUrl = drop.clients?.chat_webhook_url ?? null;
  const title = TITLE_BY_STATUS[comment.status](comment.authorName, clientName);
  // Truncate only the in-app notification body — chat gets full content.
  const preview = comment.content.slice(0, 140) + (comment.content.length > 140 ? '…' : '');
  const linkPath = `/admin/calendar/${drop.id}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const dropUrl = `${appUrl}${linkPath}`;

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

  // Google Chat:
  // - comment / changes_requested → post immediately with full content + attachments
  // - approved → post only when every post in this share link is approved
  if (!chatWebhookUrl) return;

  if (comment.status === 'comment' || comment.status === 'changes_requested') {
    const verb = comment.status === 'changes_requested' ? 'requested changes' : 'commented';
    const quoted = comment.content
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    const attachmentBlock =
      comment.attachments.length > 0
        ? '\n\n' +
          comment.attachments.map((a) => `📎 ${a.filename}\n${a.url}`).join('\n\n')
        : '';
    const text = `*${comment.authorName}* ${verb} on ${clientName}:\n${quoted}${attachmentBlock}\n\n${dropUrl}`;
    postToGoogleChatSafe(chatWebhookUrl, { text }, `comment ${dropId}`);
    return;
  }

  // status === 'approved' → check all-approved
  const reviewLinkIds = Object.values(reviewLinkMap);
  if (reviewLinkIds.length === 0) return;

  const { data: approvals } = await admin
    .from('post_review_comments')
    .select('review_link_id')
    .in('review_link_id', reviewLinkIds)
    .eq('status', 'approved');

  const approvedSet = new Set((approvals ?? []).map((a) => a.review_link_id));
  const allApproved = reviewLinkIds.every((id) => approvedSet.has(id));
  if (!allApproved) return;

  // Race: concurrent approvers may both observe "all approved" and post twice.
  // Accepted for now; revisit with a unique-message-key gate if it bites.
  const text = `🎉 All ${reviewLinkIds.length} posts in ${clientName}'s calendar are approved.\n${dropUrl}`;
  postToGoogleChatSafe(chatWebhookUrl, { text }, `all-approved ${dropId}`);
}
