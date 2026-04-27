import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications/create';
import { sendDropCommentEmail } from '@/lib/email/resend';

const BodySchema = z.object({
  postId: z.string().uuid(),
  authorName: z.string().min(1).max(80),
  content: z.string().min(1).max(2000),
  status: z.enum(['approved', 'changes_requested', 'comment']),
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

  const reviewLinkId = link.post_review_link_map?.[parsed.data.postId];
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
    })
    .select('id, review_link_id, author_name, content, status, created_at')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'failed' }, { status: 500 });
  }

  // Fire-and-forget notifications. Don't block the comment response — admins
  // see the toast/badge on next nav, and the email is best-effort.
  notifyAdminsOfComment(admin, link.drop_id, {
    authorName: parsed.data.authorName.trim(),
    content: parsed.data.content.trim(),
    status: parsed.data.status,
  }).catch((err) => console.error('Comment notification failed:', err));

  return NextResponse.json({ comment: data });
}

async function notifyAdminsOfComment(
  admin: ReturnType<typeof createAdminClient>,
  dropId: string,
  comment: { authorName: string; content: string; status: 'approved' | 'changes_requested' | 'comment' },
) {
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, created_by, clients(name)')
    .eq('id', dropId)
    .single<{ id: string; created_by: string; clients: { name: string } | null }>();
  if (!drop) return;

  const clientName = drop.clients?.name ?? 'Client';
  const title = TITLE_BY_STATUS[comment.status](comment.authorName, clientName);
  const preview = comment.content.slice(0, 140) + (comment.content.length > 140 ? '…' : '');
  const linkPath = `/admin/calendar/${drop.id}`;

  const [{ data: admins }, { data: owner }] = await Promise.all([
    admin.from('users').select('id').eq('role', 'admin'),
    admin.from('users').select('email').eq('id', drop.created_by).single<{ email: string | null }>(),
  ]);

  for (const a of admins ?? []) {
    createNotification({
      recipientUserId: a.id,
      type: 'general',
      title,
      body: preview,
      linkPath,
    }).catch(() => {});
  }

  if (owner?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    sendDropCommentEmail({
      to: owner.email,
      authorName: comment.authorName,
      clientName,
      status: comment.status,
      contentPreview: preview,
      dropUrl: `${appUrl}${linkPath}`,
    }).catch((err) => console.error('Content calendar comment email send failed:', err));
  }
}
