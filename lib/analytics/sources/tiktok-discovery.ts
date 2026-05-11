/**
 * VFF-03 T06: TikTok discovery wrapper. Calls the Apify TikTok scraper actor
 * (default `clockworks/tiktok-scraper`) for both reference-creator pulls and
 * keyword pulls. Returns normalized DiscoveredVideo shape ready for upsert
 * into `viral_videos`.
 *
 * STUB IMPLEMENTATION — the live Apify call is implemented via fetch to the
 * Apify run-sync-get-dataset-items endpoint. If APIFY_TOKEN is missing we
 * return an empty list and surface that fact in telemetry; the orchestrator
 * treats this as a soft no-op rather than a hard failure.
 */

import crypto from 'crypto';
import type { DiscoveredVideo, DiscoveryResult } from '../discovery-types';

const DEFAULT_ACTOR = 'clockworks/tiktok-scraper';
const APIFY_BASE = 'https://api.apify.com/v2/acts';

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function trimPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const keep = [
    'id',
    'webVideoUrl',
    'videoUrl',
    'url',
    'playCount',
    'diggCount',
    'shareCount',
    'commentCount',
    'createTime',
    'authorMeta',
    'videoMeta',
    'covers',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (k in r) out[k] = r[k];
  const str = JSON.stringify(out);
  if (str.length > 8192) return { ...out, truncated: true };
  return out;
}

function normalizeOne(raw: Record<string, unknown>): DiscoveredVideo | null {
  const id =
    typeof raw.id === 'string'
      ? raw.id
      : typeof raw.id === 'number'
        ? String(raw.id)
        : null;
  const url =
    (typeof raw.webVideoUrl === 'string' && raw.webVideoUrl) ||
    (typeof raw.url === 'string' && raw.url) ||
    (typeof raw.videoUrl === 'string' && raw.videoUrl) ||
    null;
  if (!id || !url) return null;
  const author = (raw.authorMeta ?? {}) as { name?: string; nickName?: string };
  const videoMeta = (raw.videoMeta ?? {}) as { duration?: number; coverUrl?: string };
  const covers = (raw.covers ?? {}) as { default?: string; origin?: string };
  return {
    platform: 'tiktok',
    source_url: url,
    source_url_hash: hashUrl(url),
    external_post_id: id,
    creator_handle: author.name ?? null,
    creator_display_name: author.nickName ?? null,
    thumbnail_source_url:
      videoMeta.coverUrl ?? covers.origin ?? covers.default ?? null,
    duration_seconds:
      typeof videoMeta.duration === 'number' ? Math.round(videoMeta.duration) : null,
    views_count: typeof raw.playCount === 'number' ? raw.playCount : null,
    likes_count: typeof raw.diggCount === 'number' ? raw.diggCount : null,
    comments_count: typeof raw.commentCount === 'number' ? raw.commentCount : null,
    shares_count: typeof raw.shareCount === 'number' ? raw.shareCount : null,
    posted_at:
      typeof raw.createTime === 'number'
        ? new Date(raw.createTime * 1000).toISOString()
        : null,
    raw_payload: trimPayload(raw),
  };
}

async function runActor(input: Record<string, unknown>): Promise<{
  videos: DiscoveredVideo[];
  cost_usd: number;
  error?: string;
}> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return { videos: [], cost_usd: 0, error: 'APIFY_TOKEN missing' };
  }
  const actorId = (process.env.VFF_APIFY_TIKTOK_ACTOR ?? DEFAULT_ACTOR).replace('/', '~');
  const url = `${APIFY_BASE}/${actorId}/run-sync-get-dataset-items?token=${token}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      return { videos: [], cost_usd: 0, error: `apify ${res.status}` };
    }
    const items = (await res.json()) as unknown;
    if (!Array.isArray(items)) return { videos: [], cost_usd: 0 };
    const videos = items
      .map((i) => normalizeOne(i as Record<string, unknown>))
      .filter((v): v is DiscoveredVideo => v !== null);
    // Rough cost estimate: $0.30 per 100 videos (D-02 reference cost).
    const cost = (videos.length / 100) * 0.3;
    return { videos, cost_usd: Number(cost.toFixed(4)) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'apify fetch failed';
    return { videos: [], cost_usd: 0, error: msg };
  }
}

export async function discoverTikTokForCreators(
  handles: string[],
  perCreatorLimit = 10,
): Promise<DiscoveryResult> {
  if (handles.length === 0) {
    return { videos: [], cost_usd: 0, signal: 'creators_empty' };
  }
  const res = await runActor({
    profiles: handles.slice(0, 6),
    resultsPerPage: perCreatorLimit,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  });
  return {
    videos: res.videos,
    cost_usd: res.cost_usd,
    error: res.error,
    signal: res.error ? 'failed' : 'ok',
  };
}

export async function discoverTikTokForKeywords(
  terms: string[],
  perKeywordLimit = 10,
): Promise<DiscoveryResult> {
  if (terms.length === 0) {
    return { videos: [], cost_usd: 0, signal: 'keywords_empty' };
  }
  const res = await runActor({
    searchQueries: terms.slice(0, 5),
    resultsPerPage: perKeywordLimit,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  });
  return {
    videos: res.videos,
    cost_usd: res.cost_usd,
    error: res.error,
    signal: res.error ? 'failed' : 'ok',
  };
}
