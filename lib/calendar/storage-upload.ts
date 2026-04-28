import type { SupabaseClient } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';

// Supabase project upload limit on the standard /object endpoint is 50MB.
// Anything bigger goes through the TUS resumable endpoint, which has no
// per-request cap. Threshold leaves margin under that limit.
const SINGLE_PUT_LIMIT = 40 * 1024 * 1024;

const RETRY_DELAYS_MS = [0, 1500, 3000];

// Transient upstream failures from Supabase Storage we should retry on.
// Matches "Bad Gateway", "Service Unavailable", "Gateway Timeout",
// network resets, and generic 5xx error bodies.
const TRANSIENT_RE = /(bad gateway|gateway timeout|service unavailable|internal server error|temporarily unavailable|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up|5\d\d)/i;

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return TRANSIENT_RE.test(msg);
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (RETRY_DELAYS_MS[attempt] > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === RETRY_DELAYS_MS.length - 1) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[storage-upload] ${label} attempt ${attempt + 1} failed (transient): ${msg} — retrying`);
    }
  }
  throw lastErr ?? new Error(`${label} failed`);
}

export async function uploadVideoBytes(
  admin: SupabaseClient,
  opts: { dropId: string; videoId: string; buffer: Buffer; mimeType: string; ext: string },
): Promise<string> {
  const path = `drops/${opts.dropId}/${opts.videoId}.${opts.ext}`;
  if (opts.buffer.byteLength <= SINGLE_PUT_LIMIT) {
    await withRetry(`video upload ${path}`, async () => {
      const { error } = await admin.storage
        .from('scheduler-media')
        .upload(path, opts.buffer, { contentType: opts.mimeType, upsert: true });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    });
  } else {
    // TUS already retries internally via retryDelays.
    await tusUpload({
      bucket: 'scheduler-media',
      path,
      buffer: opts.buffer,
      mimeType: opts.mimeType,
    });
  }
  const { data } = admin.storage.from('scheduler-media').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadThumbnail(
  admin: SupabaseClient,
  opts: { dropId: string; videoId: string; buffer: Buffer },
): Promise<string> {
  const path = `drops/${opts.dropId}/${opts.videoId}.jpg`;
  await withRetry(`thumbnail upload ${path}`, async () => {
    const { error } = await admin.storage
      .from('scheduler-thumbnails')
      .upload(path, opts.buffer, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`Thumbnail upload failed: ${error.message}`);
  });

  const { data } = admin.storage.from('scheduler-thumbnails').getPublicUrl(path);
  return data.publicUrl;
}

async function tusUpload(opts: {
  bucket: string;
  path: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for resumable upload');
  }

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(opts.buffer as unknown as Buffer, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1500, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${serviceKey}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: opts.bucket,
        objectName: opts.path,
        contentType: opts.mimeType,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => reject(new Error(`TUS upload failed: ${err.message ?? String(err)}`)),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}
