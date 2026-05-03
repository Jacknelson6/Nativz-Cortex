import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

const FinalizeSchema = z.object({
  uploadId: z.string().min(1),
});

/**
 * POST /api/calendar/share/[token]/revision/[postId]/mux-finalize
 *
 * Admin-only. Called by the share-page client after the Mux uploader widget
 * reports success. Stamps the revision metadata that the toast + sync logic
 * downstream rely on:
 *   - revised_video_uploaded_at = now
 *   - revised_video_uploaded_by = the editor
 *   - revised_video_notify_pending = true (so the floating "notify client?"
 *     toast persists across renders)
 *   - mux_status = 'processing' (Mux is now packaging the asset)
 *
 * The actual playback id arrives later via the asset.ready webhook. The
 * client polls the share endpoint for that.
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

  const body = await req.json().catch(() => null);
  const parsed = FinalizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'uploadId required' }, { status: 400 });
  }
  const { uploadId } = parsed.data;

  const admin = createAdminClient();
  // Validate the upload id belongs to a row inside this share link's drop
  // and post — guards against a token holder reusing a stranger's upload id.
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
    .select('id, mux_upload_id')
    .eq('drop_id', link.drop_id)
    .eq('scheduled_post_id', postId)
    .single<{ id: string; mux_upload_id: string | null }>();
  if (!video) return NextResponse.json({ error: 'video not found' }, { status: 404 });
  if (video.mux_upload_id !== uploadId) {
    // Defense in depth — the upload id in the request must match the one we
    // minted for this row. If it doesn't, somebody is replaying.
    return NextResponse.json({ error: 'upload id mismatch' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  // Null out the prior cut's URLs in lockstep with stamping the new
  // upload. Without this, a re-revision (editor uploads cut #2 before the
  // cron has fired on cut #1) leaves cut #1's `revised_mp4_url` intact, so
  // the cron sees `revised_video_uploaded_at` is recent AND
  // `revised_mp4_url` is non-null and ships the OLD file. We want the cron
  // to treat the row as "revision pending" until the new asset.ready /
  // static_renditions.ready webhooks repopulate these fields.
  const { error: updateErr } = await admin
    .from('content_drop_videos')
    .update({
      revised_video_url: null,
      revised_mp4_url: null,
      mux_playback_id: null,
      mux_asset_id: null,
      revised_video_uploaded_at: nowIso,
      revised_video_uploaded_by: user.id,
      revised_video_notify_pending: true,
      mux_status: 'processing',
    })
    .eq('id', video.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ uploaded_at: nowIso });
}
