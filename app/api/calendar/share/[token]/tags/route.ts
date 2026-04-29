import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const HandleSchema = z
  .string()
  .min(1)
  .max(80)
  .transform((v) => v.trim().replace(/^@+/, ''))
  .refine((v) => v.length > 0, 'handle is empty')
  .refine((v) => /^[A-Za-z0-9._\-/:?=&%]+$/.test(v), 'invalid characters');

const BodySchema = z.object({
  postId: z.string().uuid(),
  authorName: z.string().min(1).max(80),
  action: z.enum(['add', 'remove']),
  kind: z.enum(['tag', 'collab']),
  handle: HandleSchema,
});

const COLUMN_BY_KIND = { tag: 'tagged_people', collab: 'collaborator_handles' } as const;

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

  const column = COLUMN_BY_KIND[parsed.data.kind];

  const { data: post } = await admin
    .from('scheduled_posts')
    .select(`id, ${column}`)
    .eq('id', parsed.data.postId)
    .single<Record<string, unknown> & { id: string }>();
  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 });

  const current: string[] = Array.isArray(post[column]) ? (post[column] as string[]) : [];
  let next: string[];
  if (parsed.data.action === 'add') {
    if (current.includes(parsed.data.handle)) {
      return NextResponse.json({ ok: true, [column]: current, comment: null });
    }
    next = [...current, parsed.data.handle];
  } else {
    if (!current.includes(parsed.data.handle)) {
      return NextResponse.json({ ok: true, [column]: current, comment: null });
    }
    next = current.filter((h) => h !== parsed.data.handle);
  }

  const { error: updErr } = await admin
    .from('scheduled_posts')
    .update({ [column]: next })
    .eq('id', parsed.data.postId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const verb = parsed.data.action === 'add' ? 'added' : 'removed';
  const noun = parsed.data.kind === 'tag' ? 'tag' : 'collaborator';

  const { data: commentRow, error: insErr } = await admin
    .from('post_review_comments')
    .insert({
      review_link_id: reviewLinkId,
      author_name: parsed.data.authorName.trim(),
      content: `${verb} ${noun} @${parsed.data.handle}`,
      status: 'tag_edit',
      attachments: [],
      metadata: {
        action: parsed.data.action,
        kind: parsed.data.kind,
        handle: parsed.data.handle,
      },
    })
    .select('id, review_link_id, author_name, content, status, created_at, attachments, caption_before, caption_after, metadata')
    .single();
  if (insErr || !commentRow) {
    return NextResponse.json({ error: insErr?.message ?? 'failed to record edit' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    [column]: next,
    comment: commentRow,
  });
}
