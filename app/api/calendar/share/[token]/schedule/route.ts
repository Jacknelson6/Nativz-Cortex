import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const BodySchema = z.object({
  postId: z.string().uuid(),
  authorName: z.string().min(1).max(80),
  scheduledAt: z.string().datetime().nullable(),
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

  const { data: post } = await admin
    .from('scheduled_posts')
    .select('id, scheduled_at, status')
    .eq('id', parsed.data.postId)
    .single<{ id: string; scheduled_at: string | null; status: string }>();
  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 });

  // Once a post is published or in-flight, the date is no longer the client's
  // to change — Zernio has already handed it off.
  if (post.status === 'published' || post.status === 'publishing' || post.status === 'partially_failed') {
    return NextResponse.json({ error: 'post has already been published' }, { status: 409 });
  }

  const previousAt = post.scheduled_at;
  const nextAt = parsed.data.scheduledAt;
  if ((previousAt ?? null) === (nextAt ?? null)) {
    return NextResponse.json({ ok: true, scheduledAt: nextAt, comment: null });
  }

  const { error: updErr } = await admin
    .from('scheduled_posts')
    .update({ scheduled_at: nextAt })
    .eq('id', parsed.data.postId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Auto-extend the parent drop's date range if the new scheduled date sits
  // outside the existing window.
  if (nextAt) {
    const { data: drop } = await admin
      .from('content_drops')
      .select('id, start_date, end_date')
      .eq('id', link.drop_id)
      .single<{ id: string; start_date: string; end_date: string }>();
    if (drop) {
      const newDay = nextAt.slice(0, 10);
      const updates: { start_date?: string; end_date?: string } = {};
      if (newDay < drop.start_date) updates.start_date = newDay;
      if (newDay > drop.end_date) updates.end_date = newDay;
      if (Object.keys(updates).length > 0) {
        await admin.from('content_drops').update(updates).eq('id', drop.id);
      }
    }
  }

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'unscheduled';

  const { data: commentRow, error: insErr } = await admin
    .from('post_review_comments')
    .insert({
      review_link_id: reviewLinkId,
      author_name: parsed.data.authorName.trim(),
      content: `Moved post from ${fmt(previousAt)} → ${fmt(nextAt)}`,
      status: 'schedule_change',
      attachments: [],
      metadata: {
        previous_scheduled_at: previousAt,
        next_scheduled_at: nextAt,
      },
    })
    .select('id, review_link_id, author_name, content, status, created_at, attachments, caption_before, caption_after, metadata')
    .single();
  if (insErr || !commentRow) {
    return NextResponse.json({ error: insErr?.message ?? 'failed to record schedule change' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    scheduledAt: nextAt,
    comment: commentRow,
  });
}
