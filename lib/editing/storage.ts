import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Helpers for the `editing-media` Supabase Storage bucket. We mint a
 * signed-upload URL on the server and let the browser PUT bytes
 * directly so we don't proxy multi-hundred-MB videos through a Vercel
 * Function (function bodies are capped well below typical short-form
 * clip sizes).
 *
 * Path convention: `editing/<project_id>/<video_id>/<sanitized_filename>`.
 * Keying by video id (not just filename) means re-uploads of the same
 * filename don't clobber prior versions; `editing_project_videos`
 * tracks the version int, the storage paths stay distinct.
 */

export const EDITING_BUCKET = 'editing-media';

/** Strip path-unsafe characters out of a filename without losing the
 *  extension. Editors paste raw camera filenames in here ("MVI_4581.MOV",
 *  "Raw clip 02 (final final).mp4") so we whitelist a-z0-9._- and
 *  replace everything else with `_`. */
export function sanitizeFilename(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-200) || 'upload.bin';
}

export function buildEditingStoragePath(opts: {
  projectId: string;
  videoId: string;
  filename: string;
}): string {
  return `editing/${opts.projectId}/${opts.videoId}/${sanitizeFilename(opts.filename)}`;
}

/**
 * Mint a signed-upload URL the browser will PUT to. Supabase signed
 * upload URLs are one-shot and short-lived (default ~2 minutes). The
 * client must include the matching `token` from the URL when calling
 * `uploadToSignedUrl`.
 */
export async function createEditingUploadUrl(
  admin: SupabaseClient,
  storagePath: string,
): Promise<{ signedUrl: string; token: string; path: string }> {
  const { data, error } = await admin.storage
    .from(EDITING_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !data) {
    throw new Error(`Failed to create signed upload URL: ${error?.message ?? 'no data'}`);
  }
  return { signedUrl: data.signedUrl, token: data.token, path: data.path };
}

export function getEditingPublicUrl(
  admin: SupabaseClient,
  storagePath: string,
): string {
  const { data } = admin.storage.from(EDITING_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

/** Best-effort cleanup. Used by the post-publish cron and by manual
 *  deletes from the editing UI. Errors are swallowed because the row
 *  is the source of truth, not the storage object. */
export async function deleteEditingObject(
  admin: SupabaseClient,
  storagePath: string,
): Promise<void> {
  await admin.storage.from(EDITING_BUCKET).remove([storagePath]);
}
