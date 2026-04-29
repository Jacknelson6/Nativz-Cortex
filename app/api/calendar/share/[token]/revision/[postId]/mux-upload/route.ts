import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getMux } from '@/lib/mux/client';

/**
 * POST /api/calendar/share/[token]/revision/[postId]/mux-upload
 *
 * Admin-only. Mints a Mux direct-upload URL the browser can PUT bytes to —
 * bypassing Vercel's 4.5MB body limit (the reason multipart uploads to our own
 * function were 413-ing on real videos).
 *
 * We persist the upload id immediately so the webhook handler can match it
 * back to the right row when Mux pings us with the eventual asset/playback id.
 *
 * Companion endpoints:
 *   - mux-finalize: client calls after the uploader widget reports success,
 *     so we can stamp revised_video_uploaded_at + flip notify-pending in the
 *     same way the legacy upload route did.
 *   - /api/mux/webhook: receives video.asset.created / video.asset.ready and
 *     fills in mux_asset_id + mux_playback_id.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string; postId: string }> },
) {
  const { token, postId } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('drop_id, included_post_ids, expires_at')
    .eq('token', token)
    .single<{ drop_id: string; included_post_ids: string[]; expires_at: string }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }
  if (!link.included_post_ids?.includes(postId)) {
    return NextResponse.json({ error: 'post is not part of this share link' }, { status: 400 });
  }

  const { data: video } = await admin
    .from('content_drop_videos')
    .select('id')
    .eq('drop_id', link.drop_id)
    .eq('scheduled_post_id', postId)
    .single<{ id: string }>();
  if (!video) return NextResponse.json({ error: 'video not found' }, { status: 404 });

  // CORS origin: the browser will PUT directly to Mux, so Mux needs to know
  // which origin we're calling from. We trust the request URL — it's our
  // own deployment.
  const origin = new URL(req.url).origin;

  const mux = getMux();
  const upload = await mux.video.uploads.create({
    cors_origin: origin,
    new_asset_settings: {
      playback_policies: ['public'],
      // Reasonable defaults for short-form vertical video. Mux figures out
      // resolution from the source.
      video_quality: 'basic',
    },
  });

  // Persist the upload id so the webhook can find this row later.
  // mux_status='uploading' lets the UI render a progress state.
  const { error: updateErr } = await admin
    .from('content_drop_videos')
    .update({
      mux_upload_id: upload.id,
      mux_status: 'uploading',
      // Reset asset/playback so the UI doesn't keep showing the previous cut
      // while a new one is uploading.
      mux_asset_id: null,
      mux_playback_id: null,
    })
    .eq('id', video.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    uploadId: upload.id,
    uploadUrl: upload.url,
  });
}
