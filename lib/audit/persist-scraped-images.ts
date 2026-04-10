/**
 * Download scraped TikTok/IG/FB/YT images and upload them to our own Supabase
 * storage bucket. The actors hand back CDN URLs that are signed with short
 * `x-expires` params (~24-48h for TikTok, similar for IG), so any audit older
 * than a day shows broken thumbnails and avatars. Persisting at scrape time
 * makes the report durable.
 *
 * Reuses the existing `moodboard-frames` public bucket with an `audit/<id>/`
 * prefix so no new bucket or migration is needed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformReport, ProspectVideo, ProspectProfile } from './types';

const BUCKET = 'moodboard-frames';
const PER_IMAGE_TIMEOUT_MS = 10_000;

/**
 * Download a single image and upload it under the given path. Returns the
 * public URL on success, or null on failure (network error, 403, bad content).
 */
async function persistOne(
  admin: SupabaseClient,
  sourceUrl: string | null | undefined,
  storagePath: string,
): Promise<string | null> {
  if (!sourceUrl || typeof sourceUrl !== 'string' || !sourceUrl.startsWith('http')) {
    return null;
  }
  try {
    const res = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(PER_IMAGE_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) return null;

    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });
    if (uploadError) {
      console.warn(`[audit] persist failed for ${storagePath}:`, uploadError.message);
      return null;
    }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[audit] persist error for ${storagePath}:`, msg);
    return null;
  }
}

/**
 * Persist every avatar + video thumbnail on a single platform report in
 * parallel. Mutates the report in-place so downstream consumers (scorecard,
 * videos_data, UI) see the persisted URLs.
 */
async function persistPlatformReportImages(
  admin: SupabaseClient,
  auditId: string,
  report: PlatformReport,
): Promise<void> {
  const platformPrefix = `audit/${auditId}/${report.platform}`;

  const jobs: Promise<void>[] = [];

  // Profile avatar
  if (report.profile.avatarUrl) {
    jobs.push(
      (async () => {
        const persisted = await persistOne(
          admin,
          report.profile.avatarUrl,
          `${platformPrefix}/avatar.jpg`,
        );
        if (persisted) {
          // Narrow: we just checked avatarUrl is a non-null string on report.profile.
          (report.profile as ProspectProfile).avatarUrl = persisted;
        }
      })(),
    );
  }

  // Video thumbnails
  report.videos.forEach((video, i) => {
    if (!video.thumbnailUrl) return;
    jobs.push(
      (async () => {
        const persisted = await persistOne(
          admin,
          video.thumbnailUrl,
          `${platformPrefix}/video-${i}.jpg`,
        );
        if (persisted) {
          (video as ProspectVideo).thumbnailUrl = persisted;
        }
      })(),
    );
  });

  await Promise.all(jobs);
}

/**
 * Persist every platform report's images. Runs reports in parallel so total
 * wall time is roughly the slowest platform, not the sum.
 */
export async function persistAllScrapedImages(
  admin: SupabaseClient,
  auditId: string,
  reports: PlatformReport[],
): Promise<void> {
  await Promise.all(reports.map((r) => persistPlatformReportImages(admin, auditId, r)));
}
