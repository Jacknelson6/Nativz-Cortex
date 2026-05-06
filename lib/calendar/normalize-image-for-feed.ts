/**
 * Instagram-feed aspect-ratio normalizer.
 *
 * Instagram's feed accepts images with aspect ratios between 0.8 (4:5) and
 * 1.91 (1.91:1). Anything outside that range — most commonly the 9:16
 * vertical exports we get from Drive folders — gets auto-routed by Zernio
 * to Stories instead of the feed grid. That's a silent regression: we ask
 * for a feed post (no `contentType`), Zernio publishes it, but it ends up
 * on the story rail.
 *
 * This module sits in front of the publish path and rewrites out-of-range
 * source URLs to a 4:5 center-cropped render. Renders are cached on
 * `scheduler_media.feed_normalized_url` so retries don't repeat the work.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const FEED_MIN_RATIO = 0.8;
const FEED_MAX_RATIO = 1.91;
const TARGET_W = 1080;
const TARGET_H = 1350; // 4:5
const BUCKET = 'scheduler-media';

interface MediaRow {
  id: string;
  late_media_url: string | null;
  storage_path: string | null;
  feed_normalized_url: string | null;
  width: number | null;
  height: number | null;
}

function publicUrlFor(admin: SupabaseClient, key: string): string {
  return admin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

function inFeedRange(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio >= FEED_MIN_RATIO && ratio <= FEED_MAX_RATIO;
}

/**
 * Center-crop the source image to a 1080x1350 (4:5) canvas. Sharp's
 * `cover` fit scales-to-cover then trims edges, so the subject stays
 * pixel-perfect at native resolution and we just lose the top/bottom (or
 * left/right) bands that don't fit. Output is JPEG (smaller than PNG, and
 * Instagram re-compresses anyway).
 */
async function renderFeedCenterCrop(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('Could not read image dimensions');
  }

  return sharp(input)
    .resize(TARGET_W, TARGET_H, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function downloadBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fetch ${res.status} for ${url}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Ensure the given scheduler_media row has a feed-compatible URL. Returns
 * the URL the publisher should hand to Zernio:
 *  - the cached `feed_normalized_url` if already rendered;
 *  - the original `late_media_url` if the source is already in-range;
 *  - a freshly rendered 4:5 letterbox URL otherwise (and caches it).
 *
 * Falls back to the original URL on any failure so a render bug never
 * blocks publishing — worst case the post lands as a Story (the existing
 * behavior we're trying to improve), which is what would have happened
 * anyway.
 */
export async function ensureFeedCompatibleUrl(
  admin: SupabaseClient,
  row: MediaRow,
): Promise<string> {
  const sourceUrl = row.late_media_url ?? row.storage_path;
  if (!sourceUrl) throw new Error('Media row has no source URL');

  if (row.feed_normalized_url) return row.feed_normalized_url;

  // Trust stored width/height when present. Saves a round-trip download for
  // ingest paths that already populate dimensions.
  if (row.width && row.height && inFeedRange(row.width, row.height)) {
    return sourceUrl;
  }

  let bytes: Buffer;
  try {
    bytes = await downloadBytes(sourceUrl);
  } catch (err) {
    console.warn('[feed-normalize] download failed, using source URL', err);
    return sourceUrl;
  }

  // If width/height weren't stored, probe now and short-circuit when in-range.
  let probedW = row.width ?? 0;
  let probedH = row.height ?? 0;
  if (!probedW || !probedH) {
    try {
      const meta = await sharp(bytes).metadata();
      probedW = meta.width ?? 0;
      probedH = meta.height ?? 0;
    } catch {
      // Fall through to letterbox attempt.
    }
  }
  if (probedW && probedH && inFeedRange(probedW, probedH)) {
    // Source was already feed-safe; cache the dimensions so future calls
    // skip the download.
    if (!row.width || !row.height) {
      await admin
        .from('scheduler_media')
        .update({ width: probedW, height: probedH })
        .eq('id', row.id);
    }
    return sourceUrl;
  }

  let rendered: Buffer;
  try {
    rendered = await renderFeedCenterCrop(bytes);
  } catch (err) {
    console.warn('[feed-normalize] render failed, using source URL', err);
    return sourceUrl;
  }

  const key = `normalized/${row.id}.jpg`;
  const upload = await admin.storage
    .from(BUCKET)
    .upload(key, rendered, { contentType: 'image/jpeg', upsert: true });
  if (upload.error) {
    console.warn('[feed-normalize] upload failed, using source URL', upload.error);
    return sourceUrl;
  }

  const normalizedUrl = publicUrlFor(admin, key);
  await admin
    .from('scheduler_media')
    .update({ feed_normalized_url: normalizedUrl })
    .eq('id', row.id);

  return normalizedUrl;
}
