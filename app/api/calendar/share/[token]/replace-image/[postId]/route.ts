import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { uploadImageAsset } from '@/lib/calendar/storage-upload';

/**
 * POST /api/calendar/share/[token]/replace-image/[postId]
 *
 * Admin-only. Mirrors the Replace flow that already exists for video posts
 * (revision/[postId]/mux-upload), but for image posts: a new image lands in
 * scheduler-media, the post's `content_drop_post_assets` row is repointed at
 * the fresh URL, and any cached `feed_normalized_url` on the linked
 * `scheduler_media` row is busted so the next render regenerates it from the
 * new source.
 *
 * Single-image posts only (the most common case from the calendar share
 * screen). Multi-asset carousels need a per-asset selector before we can
 * support them here — out of scope for the initial ship.
 *
 * Request: multipart/form-data with a single `file` field (JPEG/PNG/WebP).
 * Response: 200 { url } on success.
 */

const ALLOWED_IMAGE_PREFIXES = ['image/'];
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — same cap as the comment-attachment uploader.

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

  // Validate request body — multipart with a single image file.
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file missing' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 25MB)' }, { status: 413 });
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_IMAGE_PREFIXES.some((p) => mime.startsWith(p))) {
    return NextResponse.json({ error: 'unsupported file type' }, { status: 415 });
  }

  // Locate the drop_video + asset the share viewer is showing for this post.
  // Single-image posts only — bail early on carousels so we don't silently
  // overwrite the wrong frame. The viewer's UI hides Replace for carousels,
  // so this is just a defensive guard.
  const { data: video } = await admin
    .from('content_drop_videos')
    .select('id, media_type')
    .eq('drop_id', link.drop_id)
    .eq('scheduled_post_id', postId)
    .single<{ id: string; media_type: string }>();
  if (!video) return NextResponse.json({ error: 'post media not found' }, { status: 404 });
  if (video.media_type !== 'image') {
    return NextResponse.json({ error: 'use the video Replace flow for video posts' }, { status: 400 });
  }

  const { data: assets } = await admin
    .from('content_drop_post_assets')
    .select('id, position')
    .eq('drop_video_id', video.id)
    .order('position', { ascending: true });
  const assetRows = (assets ?? []) as { id: string; position: number }[];
  if (assetRows.length === 0) {
    return NextResponse.json({ error: 'no asset to replace' }, { status: 404 });
  }
  if (assetRows.length > 1) {
    return NextResponse.json(
      { error: 'carousel replace is not supported yet — replace individual frames in the editor' },
      { status: 400 },
    );
  }
  const target = assetRows[0];

  // Upload the new bytes to scheduler-media. New assetId-suffixed key avoids
  // collisions with the original upload (which is still referenced by
  // scheduler_media.storage_path) and gives us a stable URL even if Storage
  // caching layers see the previous path.
  const ext = mimeToExt(mime) ?? extFromName(file.name) ?? 'jpg';
  const buffer = Buffer.from(await file.arrayBuffer());
  const newAssetId = randomUUID();
  let newUrl: string;
  try {
    newUrl = await uploadImageAsset(admin, {
      dropId: link.drop_id,
      postId,
      assetId: newAssetId,
      buffer,
      mimeType: mime,
      ext,
    });
  } catch (err) {
    console.error('[replace-image] upload failed', { postId, err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'upload failed' },
      { status: 502 },
    );
  }

  // Repoint the asset row at the new URL. Width/height clear so the
  // normalizer picks them back up from the new source the next time it
  // renders (they're metadata, not display-critical for the share viewer).
  const { error: updateAssetErr } = await admin
    .from('content_drop_post_assets')
    .update({
      asset_url: newUrl,
      mime_type: mime,
      width: null,
      height: null,
      status: 'pending_review',
    })
    .eq('id', target.id);
  if (updateAssetErr) {
    return NextResponse.json({ error: updateAssetErr.message }, { status: 500 });
  }

  // Bust the feed-normalized cache + repoint scheduler_media's late_media_url
  // for any scheduled_post_media row linked to this position. The share
  // viewer prefers feed_normalized_url over asset_url, so without this the
  // viewer keeps showing the OLD cropped JPEG even after the source flips.
  const { data: spmRows } = await admin
    .from('scheduled_post_media')
    .select('media_id, sort_order')
    .eq('post_id', postId)
    .eq('sort_order', target.position);
  const mediaIds = (spmRows ?? [])
    .map((r) => (r as { media_id: string | null }).media_id)
    .filter((m): m is string => !!m);
  if (mediaIds.length > 0) {
    await admin
      .from('scheduler_media')
      .update({
        late_media_url: newUrl,
        feed_normalized_url: null,
        mime_type: mime,
        width: null,
        height: null,
      })
      .in('id', mediaIds);
  }

  return NextResponse.json({ url: newUrl, mime_type: mime });
}

function mimeToExt(mime: string): string | null {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return map[mime.toLowerCase()] ?? null;
}

function extFromName(name: string): string | null {
  const m = name.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : null;
}
