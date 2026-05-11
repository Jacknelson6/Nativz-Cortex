import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/calendar/share/[token]/add-post/[videoId]/status
 *
 * Lightweight poll endpoint for the "+ Add new video" modal. Returns the
 * current row state so the UI can render the right phase chip:
 *
 *   - mux_uploading        — browser is still uploading bytes
 *   - mux_processing       — bytes uploaded, Mux is packaging the asset
 *   - analyzing            — capped-1080p ready, Whisper running
 *   - caption_pending      — transcript ready, caption generator running
 *   - ready                — draft_caption is set, modal can show preview
 *   - failed               — error_detail set
 *
 * Unauthenticated (token-scoped) so the poll works the same for the
 * editor's browser session as the rest of the share page does.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string; videoId: string }> },
) {
  const { token, videoId } = await ctx.params;
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
    .select(
      'id, drop_id, status, mux_status, thumbnail_url, draft_caption, draft_hashtags, error_detail',
    )
    .eq('id', videoId)
    .single<{
      id: string;
      drop_id: string;
      status: string;
      mux_status: string | null;
      thumbnail_url: string | null;
      draft_caption: string | null;
      draft_hashtags: string[] | null;
      error_detail: string | null;
    }>();
  if (!video || video.drop_id !== link.drop_id) {
    return NextResponse.json({ error: 'video not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: video.status,
    muxStatus: video.mux_status,
    thumbnailUrl: video.thumbnail_url,
    draftCaption: video.draft_caption,
    draftHashtags: video.draft_hashtags ?? [],
    errorDetail: video.error_detail,
  });
}
