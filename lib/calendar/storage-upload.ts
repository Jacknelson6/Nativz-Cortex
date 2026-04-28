import type { SupabaseClient } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';

// Supabase project upload limit on the standard /object endpoint is 50MB.
// Anything bigger goes through the TUS resumable endpoint, which has no
// per-request cap. Threshold leaves margin under that limit.
const SINGLE_PUT_LIMIT = 40 * 1024 * 1024;

export async function uploadVideoBytes(
  admin: SupabaseClient,
  opts: { dropId: string; videoId: string; buffer: Buffer; mimeType: string; ext: string },
): Promise<string> {
  const path = `drops/${opts.dropId}/${opts.videoId}.${opts.ext}`;
  if (opts.buffer.byteLength <= SINGLE_PUT_LIMIT) {
    const { error } = await admin.storage
      .from('scheduler-media')
      .upload(path, opts.buffer, { contentType: opts.mimeType, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  } else {
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
  const { error } = await admin.storage
    .from('scheduler-thumbnails')
    .upload(path, opts.buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Thumbnail upload failed: ${error.message}`);

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
