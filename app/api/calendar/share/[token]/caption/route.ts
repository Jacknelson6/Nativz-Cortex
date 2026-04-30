import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications/create';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { formatPostTimeForChat } from '@/lib/chat/format-post-time';

const BodySchema = z.object({
  postId: z.string().uuid(),
  authorName: z.string().min(1).max(80),
  caption: z.string().max(5000),
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
    .select('drop_id, post_review_link_map, expires_at, included_post_ids')
    .eq('token', token)
    .single<{
      drop_id: string;
      post_review_link_map: Record<string, string>;
      expires_at: string;
      included_post_ids: string[];
    }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  if (!link.included_post_ids?.includes(parsed.data.postId)) {
    return NextResponse.json({ error: 'post is not part of this share link' }, { status: 400 });
  }
  const reviewLinkId = link.post_review_link_map?.[parsed.data.postId];
  if (!reviewLinkId) {
    return NextResponse.json({ error: 'post is not part of this share link' }, { status: 400 });
  }

  const newCaption = parsed.data.caption.trim();

  const { data: post } = await admin
    .from('scheduled_posts')
    .select('id, caption, scheduled_at')
    .eq('id', parsed.data.postId)
    .single<{ id: string; caption: string | null; scheduled_at: string | null }>();
  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 });

  const previousCaption = post.caption ?? '';
  if (previousCaption.trim() === newCaption) {
    return NextResponse.json({ error: 'caption unchanged' }, { status: 400 });
  }

  const { error: updErr } = await admin
    .from('scheduled_posts')
    .update({ caption: newCaption })
    .eq('id', parsed.data.postId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const { data: commentRow, error: insErr } = await admin
    .from('post_review_comments')
    .insert({
      review_link_id: reviewLinkId,
      author_name: parsed.data.authorName.trim(),
      content: 'Updated the caption',
      status: 'caption_edit',
      caption_before: previousCaption,
      caption_after: newCaption,
      attachments: [],
    })
    .select('id, review_link_id, author_name, content, status, created_at, attachments, caption_before, caption_after, metadata')
    .single();
  if (insErr || !commentRow) {
    return NextResponse.json({ error: insErr?.message ?? 'failed to record edit' }, { status: 500 });
  }

  notifyOfCaptionEdit(admin, link.drop_id, token, {
    authorName: parsed.data.authorName.trim(),
    previousCaption,
    newCaption,
    scheduledAt: post.scheduled_at,
  }).catch((err) => console.error('Caption-edit notification failed:', err));

  return NextResponse.json({
    caption: newCaption,
    comment: commentRow,
  });
}

async function notifyOfCaptionEdit(
  admin: ReturnType<typeof createAdminClient>,
  dropId: string,
  token: string,
  edit: {
    authorName: string;
    previousCaption: string;
    newCaption: string;
    scheduledAt: string | null;
  },
) {
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, created_by, client_id, clients(name, chat_webhook_url)')
    .eq('id', dropId)
    .single<{
      id: string;
      created_by: string;
      client_id: string | null;
      clients: { name: string; chat_webhook_url: string | null } | null;
    }>();
  if (!drop) return;

  const clientName = drop.clients?.name ?? 'Client';
  const chatWebhookUrl = drop.clients?.chat_webhook_url ?? null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const shareUrl = `${appUrl}/c/${token}`;

  const truncate = (s: string, max = 280) =>
    s.length > max ? `${s.slice(0, max)}…` : s;
  const before = truncate(edit.previousCaption || '(empty)');
  const after = truncate(edit.newCaption || '(empty)');

  if (chatWebhookUrl) {
    const postTimeLine = formatPostTimeForChat(edit.scheduledAt);
    const postLine = postTimeLine ? `\n_Post scheduled for ${postTimeLine}_` : '';
    const text =
      `*${edit.authorName}* edited a caption for *${clientName}*.${postLine}\n` +
      `_Before:_ ${before}\n` +
      `_After:_ ${after}\n` +
      `Share link: ${shareUrl}`;
    postToGoogleChatSafe(chatWebhookUrl, { text }, `caption-edit ${dropId}`);
  }

  // Keep the in-app bell notification so admins see it inside Cortex too.
  const title = `${edit.authorName} edited a caption in ${clientName}`;
  const preview = `"${edit.newCaption.slice(0, 140)}${edit.newCaption.length > 140 ? '…' : ''}"`;
  const linkPath = `/admin/calendar/${drop.id}`;
  const { data: admins } = await admin.from('users').select('id').eq('role', 'admin');
  for (const a of admins ?? []) {
    createNotification({
      recipientUserId: a.id,
      type: 'general',
      title,
      body: preview,
      linkPath,
    }).catch(() => {});
  }
}
