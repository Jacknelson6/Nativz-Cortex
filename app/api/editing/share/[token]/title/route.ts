import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/editing/share/[token]/title
 *
 * Editable display name for a clip on an editing-project share link.
 * Mirrors the social-ad title endpoint at /api/calendar/share/[token]/title:
 * empty string clears the override and the viewer falls back to the
 * underlying upload's filename.
 */
const BodySchema = z.object({
  videoId: z.string().uuid(),
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
    .from('editing_project_share_links')
    .select('project_id, expires_at, archived_at')
    .eq('token', token)
    .maybeSingle<{
      project_id: string;
      expires_at: string;
      archived_at: string | null;
    }>();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (link.archived_at) {
    return NextResponse.json({ error: 'revoked' }, { status: 410 });
  }
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  // Confirm the video belongs to this share link's project before allowing
  // the rename. Public token + uuid is enough surface area to want this
  // gate.
  const { data: video } = await admin
    .from('editing_project_videos')
    .select('id, project_id')
    .eq('id', parsed.data.videoId)
    .maybeSingle<{ id: string; project_id: string }>();
  if (!video || video.project_id !== link.project_id) {
    return NextResponse.json(
      { error: 'video is not part of this share link' },
      { status: 400 },
    );
  }

  const trimmed = parsed.data.title.trim();
  const next = trimmed.length === 0 ? null : trimmed;

  const { error } = await admin
    .from('editing_project_videos')
    .update({ title: next })
    .eq('id', parsed.data.videoId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ title: next });
}
