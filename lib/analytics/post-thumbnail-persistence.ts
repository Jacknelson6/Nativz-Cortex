/**
 * ZNA-04: persist Zernio post thumbnails to Supabase Storage.
 *
 * Zernio CDN thumbnail URLs expire/rate-limit after ~24-48h, so the analytics
 * post grid renders broken-eye tiles on any sync older than a day. This helper
 * downloads the source image, resizes via sharp (720w / quality 80 jpeg),
 * uploads to the public `post-thumbnails` bucket at
 *   {client_id}/{post_metric_id}.jpg
 * and writes the public URL + persistence bookkeeping back onto the
 * `post_metrics` row.
 *
 * Reuses the same pattern as `lib/audit/persist-scraped-images.ts`.
 */
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const BUCKET = 'post-thumbnails';
const PER_IMAGE_TIMEOUT_MS = 10_000;
const TARGET_WIDTH = 720;
const JPEG_QUALITY = 80;

export interface PersistPostThumbnailArgs {
  supabase: SupabaseClient;
  postMetricId: string;
  clientId: string;
  zernioThumbnailUrl: string | null;
  existingHash: string | null;
}

export type PersistStatus =
  | 'persisted'
  | 'unchanged'
  | 'no_source'
  | 'fetch_failed'
  | 'upload_failed';

export interface PersistResult {
  status: PersistStatus;
  storage_url?: string;
  source_hash?: string;
  attempts: number;
}

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

async function bumpAttemptsAndFailure(
  supabase: SupabaseClient,
  postMetricId: string,
  failureKind: 'no_source' | 'fetch_failed' | 'upload_failed',
): Promise<number> {
  // Read current attempts to compute new value; cheaper than RPC.
  const { data: row } = await supabase
    .from('post_metrics')
    .select('thumbnail_persist_attempts')
    .eq('id', postMetricId)
    .maybeSingle();
  const attempts = (row?.thumbnail_persist_attempts ?? 0) + 1;
  const update: Record<string, unknown> = {
    thumbnail_persist_attempts: attempts,
  };
  if (failureKind !== 'no_source') {
    update.thumbnail_persist_failed_at = new Date().toISOString();
  }
  await supabase.from('post_metrics').update(update).eq('id', postMetricId);
  return attempts;
}

export async function persistPostThumbnail(
  args: PersistPostThumbnailArgs,
): Promise<PersistResult> {
  const { supabase, postMetricId, clientId, zernioThumbnailUrl, existingHash } = args;

  if (!zernioThumbnailUrl || !zernioThumbnailUrl.startsWith('http')) {
    const attempts = await bumpAttemptsAndFailure(supabase, postMetricId, 'no_source');
    return { status: 'no_source', attempts };
  }

  const sourceHash = hashUrl(zernioThumbnailUrl);

  // Cheap fast path: if the hash matches and we already have a stored URL,
  // skip the round-trip entirely.
  if (existingHash && existingHash === sourceHash) {
    const { data: row } = await supabase
      .from('post_metrics')
      .select('thumbnail_storage_url, thumbnail_persist_attempts')
      .eq('id', postMetricId)
      .maybeSingle();
    if (row?.thumbnail_storage_url) {
      return {
        status: 'unchanged',
        storage_url: row.thumbnail_storage_url,
        source_hash: sourceHash,
        attempts: row.thumbnail_persist_attempts ?? 0,
      };
    }
  }

  let buffer: Buffer;
  try {
    const res = await fetch(zernioThumbnailUrl, {
      signal: AbortSignal.timeout(PER_IMAGE_TIMEOUT_MS),
      headers: { 'User-Agent': 'nativz-cortex-zna-04' },
    });
    if (!res.ok) {
      const attempts = await bumpAttemptsAndFailure(supabase, postMetricId, 'fetch_failed');
      return { status: 'fetch_failed', attempts };
    }
    const original = Buffer.from(await res.arrayBuffer());
    if (original.length === 0) {
      const attempts = await bumpAttemptsAndFailure(supabase, postMetricId, 'fetch_failed');
      return { status: 'fetch_failed', attempts };
    }
    try {
      buffer = await sharp(original)
        .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
    } catch (sharpErr) {
      console.warn('[zna-04] sharp transcode failed', {
        post_id: postMetricId,
        err: sharpErr instanceof Error ? sharpErr.message : String(sharpErr),
      });
      const attempts = await bumpAttemptsAndFailure(supabase, postMetricId, 'fetch_failed');
      return { status: 'fetch_failed', attempts };
    }
  } catch (err) {
    console.warn('[zna-04] thumbnail fetch error', {
      post_id: postMetricId,
      err: err instanceof Error ? err.message : String(err),
    });
    const attempts = await bumpAttemptsAndFailure(supabase, postMetricId, 'fetch_failed');
    return { status: 'fetch_failed', attempts };
  }

  const storagePath = `${clientId}/${postMetricId}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (uploadError) {
    console.warn('[zna-04] thumbnail upload failed', {
      post_id: postMetricId,
      err: uploadError.message,
    });
    const attempts = await bumpAttemptsAndFailure(supabase, postMetricId, 'upload_failed');
    return { status: 'upload_failed', attempts };
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = publicData.publicUrl;
  const now = new Date().toISOString();

  // Bump attempts on success too so ops can see the count grow; reset failure timestamp.
  const { data: prior } = await supabase
    .from('post_metrics')
    .select('thumbnail_persist_attempts')
    .eq('id', postMetricId)
    .maybeSingle();
  const attempts = (prior?.thumbnail_persist_attempts ?? 0) + 1;

  await supabase
    .from('post_metrics')
    .update({
      thumbnail_storage_url: publicUrl,
      thumbnail_persisted_at: now,
      thumbnail_persist_failed_at: null,
      thumbnail_persist_attempts: attempts,
      thumbnail_source_hash: sourceHash,
    })
    .eq('id', postMetricId);

  return {
    status: 'persisted',
    storage_url: publicUrl,
    source_hash: sourceHash,
    attempts,
  };
}
