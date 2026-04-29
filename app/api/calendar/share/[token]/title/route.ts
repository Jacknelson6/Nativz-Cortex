import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/calendar/share/[token]/title
 *
 * Editable per-creative title for Social Ads / CTV Ads / Other share links.
 * Caption edits live in their own endpoint and produce a `caption_edit`
 * comment so reviewers see the change in history; titles are lighter-weight
 * admin metadata (the file's display name) and don't generate a comment
 * row — viewers just see the new label on next load.
 *
 * Empty string clears the override and the share UI falls back to the
 * underlying upload's filename.
 */
const BodySchema = z.object({
  postId: z.string().uuid(),
  title: z.string().max(160),
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
    .select('expires_at, included_post_ids')
    .eq('token', token)
    .single<{ expires_at: string; included_post_ids: string[] }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }
  if (!link.included_post_ids?.includes(parsed.data.postId)) {
    return NextResponse.json(
      { error: 'post is not part of this share link' },
      { status: 400 },
    );
  }

  const trimmed = parsed.data.title.trim();
  // Empty string ⇒ clear the override; the viewer falls back to the
  // uploaded filename. We deliberately accept this rather than rejecting
  // empty input so reverting to the default is a one-click action.
  const next = trimmed.length === 0 ? null : trimmed;

  const { error } = await admin
    .from('scheduled_posts')
    .update({ title: next })
    .eq('id', parsed.data.postId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ title: next });
}
