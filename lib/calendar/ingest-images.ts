import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadDriveMedia } from './drive-folder';
import { uploadImageAsset } from './storage-upload';

const CONCURRENCY = 4;

interface AssetRow {
  id: string;
  drop_video_id: string;
  drive_file_id: string;
  drive_file_name: string;
  mime_type: string | null;
}

function deriveExt(mimeType: string | null, filename: string): string {
  const m = (mimeType ?? '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('heic') || m.includes('heif')) return 'jpg';
  const dot = filename.lastIndexOf('.');
  if (dot >= 0) return filename.slice(dot + 1).toLowerCase();
  return 'jpg';
}

// Ingest pending image assets for a drop. Each asset is downloaded from
// Drive and uploaded to Supabase Storage (no compression, no thumbnail
// extraction — the image is its own thumbnail). On success the row is
// marked 'ready'. The parent post (content_drop_videos) is flipped to
// 'caption_pending' once all of its assets land.
export async function ingestDropImages(
  admin: SupabaseClient,
  opts: { dropId: string; userId: string },
): Promise<{ processed: number; failed: number }> {
  const { data: rows, error } = await admin
    .from('content_drop_post_assets')
    .select(
      'id, drop_video_id, drive_file_id, drive_file_name, mime_type, content_drop_videos!inner(drop_id)',
    )
    .eq('content_drop_videos.drop_id', opts.dropId)
    .eq('status', 'pending');

  if (error) throw new Error(error.message);
  const queue: AssetRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    drop_video_id: r.drop_video_id,
    drive_file_id: r.drive_file_id,
    drive_file_name: r.drive_file_name,
    mime_type: r.mime_type,
  }));

  let processed = 0;
  let failed = 0;
  const touchedPosts = new Set<string>();

  async function ingestOne(row: AssetRow) {
    try {
      await admin
        .from('content_drop_post_assets')
        .update({ status: 'uploading' })
        .eq('id', row.id);
      const dl = await downloadDriveMedia(opts.userId, row.drive_file_id);
      const mimeType = row.mime_type ?? dl.mimeType ?? 'image/jpeg';
      const ext = deriveExt(mimeType, row.drive_file_name);
      const url = await uploadImageAsset(admin, {
        dropId: opts.dropId,
        postId: row.drop_video_id,
        assetId: row.id,
        buffer: dl.buffer,
        mimeType,
        ext,
      });
      await admin
        .from('content_drop_post_assets')
        .update({
          status: 'ready',
          asset_url: url,
          thumbnail_url: url,
          mime_type: mimeType,
          size_bytes: dl.size,
        })
        .eq('id', row.id);
      processed += 1;
      touchedPosts.add(row.drop_video_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image ingest failed';
      failed += 1;
      await admin
        .from('content_drop_post_assets')
        .update({ status: 'failed', error_detail: message })
        .eq('id', row.id);
      touchedPosts.add(row.drop_video_id);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, (_, idx) =>
    (async () => {
      for (let i = idx; i < queue.length; i += CONCURRENCY) {
        await ingestOne(queue[i]);
      }
    })(),
  );
  await Promise.all(workers);

  // For each post touched, decide whether all of its assets landed. If so,
  // promote the post to caption_pending so the captioning pass can pick it
  // up. Posts with at least one asset still failed bubble up via parent
  // status='failed'.
  for (const postId of touchedPosts) {
    const { data: assets } = await admin
      .from('content_drop_post_assets')
      .select('status')
      .eq('drop_video_id', postId);
    const all = assets ?? [];
    if (all.length === 0) continue;
    const anyFailed = all.some((a) => a.status === 'failed');
    const anyPending = all.some((a) => a.status === 'pending' || a.status === 'uploading');
    if (anyPending) continue;
    const { data: post } = await admin
      .from('content_drop_post_assets')
      .select('asset_url')
      .eq('drop_video_id', postId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();
    const coverUrl = post?.asset_url ?? null;
    await admin
      .from('content_drop_videos')
      .update({
        status: anyFailed ? 'failed' : 'caption_pending',
        thumbnail_url: coverUrl,
        // For image posts the legacy video_url is unused; we still set it to
        // the cover so any code path that reads video_url for a "media URL"
        // gets something useful. publishScheduledPost branches on media_type
        // before consuming this anyway.
        video_url: coverUrl,
        error_detail: anyFailed ? 'One or more images failed to ingest' : null,
      })
      .eq('id', postId);
  }

  return { processed, failed };
}
