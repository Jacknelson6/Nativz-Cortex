/**
 * VFF-03 T04: persist a single Apify/YouTube thumbnail to the
 * `viral-thumbnails` Supabase Storage bucket. Apify thumbnail URLs expire in
 * 24-48h; persisting at insert time keeps the surface durable.
 *
 * Path: `viral-thumbnails/<platform>/<videoId>.<ext>`. Idempotent: if a file
 * already lives at the target path we short-circuit and return its public URL
 * without downloading again.
 */

import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'viral-thumbnails';
const PER_IMAGE_TIMEOUT_MS = 10_000;

function inferExt(contentType: string | null, sourceUrl: string): string {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  // fall back to URL suffix
  const m = sourceUrl.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
  if (m) return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  return 'jpg';
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
}

export type PersistResult = {
  storage_url: string | null;
  already_existed: boolean;
};

export async function persistViralThumbnail(
  platform: 'tiktok' | 'instagram' | 'youtube',
  videoId: string,
  sourceUrl: string | null | undefined,
): Promise<PersistResult> {
  if (!sourceUrl || typeof sourceUrl !== 'string' || !sourceUrl.startsWith('http')) {
    return { storage_url: null, already_existed: false };
  }
  const admin = createAdminClient();
  const id = safeId(videoId);
  const folder = `${platform}/`;

  // Idempotency check: list the folder, look for an existing file matching
  // <id>.* (any extension).
  try {
    const { data: existing } = await admin.storage
      .from(BUCKET)
      .list(platform, { limit: 100, search: id });
    const match = (existing ?? []).find((f) => f.name.startsWith(`${id}.`));
    if (match) {
      const { data } = admin.storage
        .from(BUCKET)
        .getPublicUrl(`${folder}${match.name}`);
      return { storage_url: data.publicUrl, already_existed: true };
    }
  } catch {
    // listing failed (bucket missing or transient) — fall through to upload.
  }

  try {
    const res = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(PER_IMAGE_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return { storage_url: null, already_existed: false };
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) return { storage_url: null, already_existed: false };

    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const ext = inferExt(contentType, sourceUrl);
    const path = `${folder}${id}.${ext}`;

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });
    if (uploadErr) {
      console.warn(`[vff] thumbnail upload failed for ${path}:`, uploadErr.message);
      return { storage_url: null, already_existed: false };
    }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return { storage_url: data.publicUrl, already_existed: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[vff] persistViralThumbnail error for ${platform}/${id}:`, msg);
    return { storage_url: null, already_existed: false };
  }
}
