import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

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

  return NextResponse.json({
    caption: newCaption,
    comment: commentRow,
  });
}
