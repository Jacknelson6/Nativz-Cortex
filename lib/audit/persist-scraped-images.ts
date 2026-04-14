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
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import type { PlatformReport, ProspectVideo, ProspectProfile, CompetitorProfile } from './types';

const BUCKET = 'moodboard-frames';
const PER_IMAGE_TIMEOUT_MS = 10_000;

/**
 * Some platforms (TikTok most notably) serve avatars as HEIC, which most
 * browsers refuse to render inline. Detect and transcode to JPEG so the
 * persisted URL renders in the audit report regardless of the source
 * format.
 *
 * Sharp's default build does NOT include HEIC decoding (libheif has
 * HEVC patent encumbrance), so we decode HEIC via the pure-JS
 * heic-convert package first, then hand the intermediate JPEG to sharp
 * for rotation + re-encode + consistent quality. For non-HEIC formats
 * sharp handles the whole thing.
 *
 * Returns the original buffer + content-type if nothing needs transcoding.
 */
async function maybeTranscodeToJpeg(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string; extOverride: '.jpg' | null }> {
  const ct = contentType.toLowerCase();
  const isHeic = ct.includes('heic') || ct.includes('heif');
  const needsSharp =
    isHeic ||
    ct.includes('avif') ||
    // Unknown or octet-stream — let sharp try; it'll throw if it can't
    ct.includes('octet-stream') ||
    ct === '' ||
    ct === 'application/json';
  if (!needsSharp) return { buffer, contentType, extOverride: null };

  try {
    let intermediate = buffer;
    if (isHeic) {
      // heic-convert returns an ArrayBuffer-ish Uint8Array; wrap in Node Buffer.
      const decoded = await heicConvert({
        buffer: buffer as unknown as ArrayBufferLike,
        format: 'JPEG',
        quality: 0.9,
      });
      intermediate = Buffer.from(decoded as ArrayBuffer);
    }
    const jpeg = await sharp(intermediate).rotate().jpeg({ quality: 85 }).toBuffer();
    return { buffer: jpeg, contentType: 'image/jpeg', extOverride: '.jpg' };
  } catch (err) {
    console.warn('[audit] HEIC/AVIF transcode failed, using original bytes:', err);
    return { buffer, contentType, extOverride: null };
  }
}

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
    const originalBuffer = Buffer.from(await res.arrayBuffer());
    if (originalBuffer.length === 0) return null;

    const rawContentType = res.headers.get('content-type') ?? 'image/jpeg';
    // TikTok avatar URLs come back as image/heic which Chrome+Firefox refuse
    // to render inline. Transcode to JPEG so the persisted URL displays
    // everywhere.
    const { buffer, contentType, extOverride } = await maybeTranscodeToJpeg(
      originalBuffer,
      rawContentType,
    );
    const finalPath = extOverride ? storagePath.replace(/\.[a-z0-9]+$/i, extOverride) : storagePath;

    const { error: uploadError } = await admin.storage.from(BUCKET).upload(finalPath, buffer, {
      contentType,
      upsert: true,
    });
    if (uploadError) {
      console.warn(`[audit] persist failed for ${finalPath}:`, uploadError.message);
      return null;
    }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(finalPath);
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
  // Count how many videos came back without a thumbnail — when this rate is
  // high it's the leading cause of the "lots of black tiles in the feed"
  // bug. Logged per-platform so we can see in Vercel logs which scraper
  // is dropping images.
  const videosWithoutThumb = report.videos.filter((v) => !v.thumbnailUrl).length;
  if (videosWithoutThumb > 0) {
    console.warn(
      `[audit] ${report.platform}: ${videosWithoutThumb}/${report.videos.length} scraped videos had no thumbnail_url — they'll render as black tiles in the feed grid`,
    );
  }
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
 * Same idea as persistPlatformReportImages but for a CompetitorProfile: one
 * avatar + one list of recentVideos thumbnails. Mutates in-place.
 */
async function persistCompetitorImages(
  admin: SupabaseClient,
  auditId: string,
  competitor: CompetitorProfile,
): Promise<void> {
  const prefix = `audit/${auditId}/competitor/${competitor.username}/${competitor.platform}`;

  const jobs: Promise<void>[] = [];

  if (competitor.avatarUrl) {
    jobs.push(
      (async () => {
        const persisted = await persistOne(admin, competitor.avatarUrl, `${prefix}/avatar.jpg`);
        if (persisted) competitor.avatarUrl = persisted;
      })(),
    );
  }

  competitor.recentVideos.forEach((video, i) => {
    if (!video.thumbnailUrl) return;
    jobs.push(
      (async () => {
        const persisted = await persistOne(admin, video.thumbnailUrl, `${prefix}/video-${i}.jpg`);
        if (persisted) (video as ProspectVideo).thumbnailUrl = persisted;
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

/**
 * Persist every competitor's avatar + video thumbnails. Same treatment as the
 * target — survives TikTok/IG CDN URL expiration so the competitor cards in
 * the audit report still render 24h later.
 */
export async function persistAllCompetitorImages(
  admin: SupabaseClient,
  auditId: string,
  competitors: CompetitorProfile[],
): Promise<void> {
  await Promise.all(competitors.map((c) => persistCompetitorImages(admin, auditId, c)));
}
