import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

const FinalizeSchema = z.object({
  uploadId: z.string().min(1),
});

/**
 * POST /api/calendar/share/[token]/add-post/[videoId]/finalize
 *
 * Admin-only. Called after the browser's Mux uploader widget reports success.
 * Flips the row from 'mux_uploading' to 'mux_processing' — the share-page poll
 * uses this to render "Generating caption…" while Mux finishes packaging.
 *
 * The analyze + caption step itself is kicked off by the
 * `video.asset.static_renditions.ready` webhook once the capped-1080p MP4
 * rendition is available, since that's what Whisper needs as input.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string; videoId: string }> },
) {
  const { token, videoId } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = FinalizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'uploadId required' }, { status: 400 });
  }
  const { uploadId } = parsed.data;

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('drop_id, expires_at')
    .eq('token', token)
    .single<{ drop_id: string; expires_at: string }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const { data: video } = await admin
    .from('content_drop_videos')
    .select('id, mux_upload_id, drop_id')
    .eq('id', videoId)
    .single<{ id: string; mux_upload_id: string | null; drop_id: string }>();
  if (!video) return NextResponse.json({ error: 'video not found' }, { status: 404 });
  if (video.drop_id !== link.drop_id) {
    return NextResponse.json({ error: 'video not on this share link' }, { status: 400 });
  }
  if (video.mux_upload_id !== uploadId) {
    return NextResponse.json({ error: 'upload id mismatch' }, { status: 400 });
  }

  const { error: updateErr } = await admin
    .from('content_drop_videos')
    .update({
      status: 'mux_processing',
      mux_status: 'uploading',
    })
    .eq('id', video.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
