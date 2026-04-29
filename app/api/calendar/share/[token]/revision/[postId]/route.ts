import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { uploadVideoBytes } from '@/lib/calendar/storage-upload';

export const maxDuration = 300;

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * POST /api/calendar/share/[token]/revision/[postId]
 *
 * Admin-only re-upload of a revised cut from inside the share link.
 * Mirrors /api/calendar/drops/[id]/posts/[postId]/revision/upload but resolves
 * the drop id from the share token so the editor doesn't need to know it.
 *
 * On success, stamps revised_video_notify_pending=true so the floating
 * "notify client?" toast persists across renders.
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
    .select('id, drop_id, scheduled_post_id')
    .eq('drop_id', link.drop_id)
    .eq('scheduled_post_id', postId)
    .single<{ id: string; drop_id: string; scheduled_post_id: string }>();
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
    dropId: link.drop_id,
    videoId: `${video.id}-revision`,
    buffer,
    mimeType: mime,
    ext,
  });

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await admin
    .from('content_drop_videos')
    .update({
      revised_video_url: url,
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

/**
 * DELETE /api/calendar/share/[token]/revision/[postId]
 *
 * Admin-only "remove from calendar" — drops the post from this share
 * link's `included_post_ids` and `post_review_link_map`. Intentionally
 * non-destructive: the underlying `scheduled_posts` row and
 * `content_drop_videos` row stay intact, so an editor who hits this by
 * mistake can re-include the post from admin UI without losing the
 * caption / media / comments. Use this when a client says "actually,
 * pull that one" or when the editor decides a post shouldn't be in the
 * calendar going to the brand.
 */
export async function DELETE(
  _req: Request,
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
    .select('id, included_post_ids, post_review_link_map, expires_at')
    .eq('token', token)
    .single<{
      id: string;
      included_post_ids: string[];
      post_review_link_map: Record<string, string>;
      expires_at: string;
    }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }
  if (!link.included_post_ids?.includes(postId)) {
    return NextResponse.json({ error: 'post is not part of this share link' }, { status: 400 });
  }

  const nextIncluded = link.included_post_ids.filter((id) => id !== postId);
  const nextMap = { ...(link.post_review_link_map ?? {}) };
  delete nextMap[postId];

  const { error: updateErr } = await admin
    .from('content_drop_share_links')
    .update({
      included_post_ids: nextIncluded,
      post_review_link_map: nextMap,
    })
    .eq('id', link.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
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
