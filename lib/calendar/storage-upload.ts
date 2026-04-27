import type { SupabaseClient } from '@supabase/supabase-js';

export async function uploadVideoBytes(
  admin: SupabaseClient,
  opts: { dropId: string; videoId: string; buffer: Buffer; mimeType: string; ext: string },
): Promise<string> {
  const path = `drops/${opts.dropId}/${opts.videoId}.${opts.ext}`;
  const { error } = await admin.storage
    .from('scheduler-media')
    .upload(path, opts.buffer, { contentType: opts.mimeType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

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
