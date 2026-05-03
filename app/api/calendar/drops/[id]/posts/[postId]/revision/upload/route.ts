import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { uploadVideoBytes } from '@/lib/calendar/storage-upload';

export const maxDuration = 300;

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * POST /api/calendar/drops/[id]/posts/[postId]/revision/upload
 *
 * Admin-only. Accepts a re-cut video for a single scheduled post inside a
 * content drop. Stores the new file under
 * `scheduler-media/drops/{dropId}/{videoId}-rev-{n}.{ext}` and stamps
 * `revised_video_url` / `revised_video_uploaded_at` / `revised_video_uploaded_by`
 * on the matching `content_drop_videos` row.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; postId: string }> },
) {
  const { id: dropId, postId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: video } = await admin
    .from('content_drop_videos')
    .select('id, drop_id, scheduled_post_id, drive_file_name')
    .eq('drop_id', dropId)
    .eq('scheduled_post_id', postId)
    .single();
  if (!video) return NextResponse.json({ error: 'video not found' }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file missing' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 500MB)' }, { status: 413 });
  }
  const mime = file.type || 'video/mp4';
  if (!mime.startsWith('video/')) {
    return NextResponse.json({ error: 'must be a video file' }, { status: 415 });
  }
  const ext = mimeToExt(mime, file.name);

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadVideoBytes(admin, {
    dropId,
    videoId: `${video.id}-revision`,
    buffer,
    mimeType: mime,
    ext,
  });

  const nowIso = new Date().toISOString();
  // CRITICAL: also stamp `revised_mp4_url` in lockstep with `revised_video_url`.
  //
  // The publish cron (`app/api/cron/publish-posts/route.ts:181-184`) refuses
  // to publish a post once `revised_video_uploaded_at` is non-null until
  // `revised_mp4_url` lands — that gate exists to wait for Mux's static
  // rendition. This legacy route, however, writes the file straight to
  // Supabase Storage and never goes through Mux, so without this assignment
  // the cron throws "Revision pending" on every retry until exhausting the
  // backoff and hard-failing the post.
  //
  // The storage URL we just got back from `uploadVideoBytes` is already a
  // directly-playable container (mp4/mov/webm/mkv). Late/Zernio ingest is
  // happy with any of those, so mirroring it into `revised_mp4_url` is the
  // right move and keeps both the cron approval/Mux-wait gate AND the
  // share-page rendering paths happy. Future: route everything through Mux
  // and delete this handler entirely.
  const { error: updateErr } = await admin
    .from('content_drop_videos')
    .update({
      revised_video_url: url,
      revised_mp4_url: url,
      revised_video_uploaded_at: nowIso,
      revised_video_uploaded_by: user.id,
      revised_video_notify_pending: true,
    })
    .eq('id', video.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    url,
    uploaded_at: nowIso,
    size_bytes: file.size,
  });
}

function mimeToExt(mime: string, fallbackName: string): string {
  const map: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-matroska': 'mkv',
  };
  if (map[mime]) return map[mime];
  const m = fallbackName.match(/\.([a-zA-Z0-9]+)$/);
  return (m?.[1] ?? 'mp4').toLowerCase();
}
