import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const BodySchema = z.object({
  postId: z.string().uuid(),
  authorName: z.string().min(1).max(80),
  content: z.string().min(1).max(2000),
  status: z.enum(['approved', 'changes_requested', 'comment']),
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
    .select('post_review_link_map, expires_at')
    .eq('token', token)
    .single<{ post_review_link_map: Record<string, string>; expires_at: string }>();
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
  return NextResponse.json({ comment: data });
}
