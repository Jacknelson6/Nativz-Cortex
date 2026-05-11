/**
 * VFF-03 T07: Instagram Reels discovery via Apify (default actor
 * `apify/instagram-scraper`). Same uniform contract as the TikTok adapter.
 */

import crypto from 'crypto';
import type { DiscoveredVideo, DiscoveryResult } from '../discovery-types';

const DEFAULT_ACTOR = 'apify/instagram-scraper';
const APIFY_BASE = 'https://api.apify.com/v2/acts';

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function trimPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const keep = [
    'id',
    'shortCode',
    'url',
    'videoUrl',
    'displayUrl',
    'videoViewCount',
    'videoPlayCount',
    'likesCount',
    'commentsCount',
    'timestamp',
    'ownerUsername',
    'ownerFullName',
    'videoDuration',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (k in r) out[k] = r[k];
  const str = JSON.stringify(out);
  if (str.length > 8192) return { ...out, truncated: true };
  return out;
}

function normalizeOne(raw: Record<string, unknown>): DiscoveredVideo | null {
  const url =
    (typeof raw.url === 'string' && raw.url) ||
    (typeof raw.shortCode === 'string' && `https://www.instagram.com/reel/${raw.shortCode}/`) ||
    null;
  if (!url) return null;
  const id =
    (typeof raw.id === 'string' && raw.id) ||
    (typeof raw.shortCode === 'string' && raw.shortCode) ||
    null;
  if (!id) return null;

  const views =
    typeof raw.videoPlayCount === 'number'
      ? raw.videoPlayCount
      : typeof raw.videoViewCount === 'number'
        ? raw.videoViewCount
        : null;
  const ts =
    typeof raw.timestamp === 'string'
      ? raw.timestamp
      : typeof raw.timestamp === 'number'
        ? new Date(raw.timestamp * 1000).toISOString()
        : null;

  return {
    platform: 'instagram',
    source_url: url,
    source_url_hash: hashUrl(url),
    external_post_id: id,
    creator_handle: typeof raw.ownerUsername === 'string' ? raw.ownerUsername : null,
    creator_display_name: typeof raw.ownerFullName === 'string' ? raw.ownerFullName : null,
    thumbnail_source_url: typeof raw.displayUrl === 'string' ? raw.displayUrl : null,
    duration_seconds:
      typeof raw.videoDuration === 'number' ? Math.round(raw.videoDuration) : null,
    views_count: views,
    likes_count: typeof raw.likesCount === 'number' ? raw.likesCount : null,
    comments_count: typeof raw.commentsCount === 'number' ? raw.commentsCount : null,
    shares_count: null,
    posted_at: ts,
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
  const actorId = (process.env.VFF_APIFY_IG_ACTOR ?? DEFAULT_ACTOR).replace('/', '~');
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
    const cost = (videos.length / 100) * 0.3;
    return { videos, cost_usd: Number(cost.toFixed(4)) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'apify fetch failed';
    return { videos: [], cost_usd: 0, error: msg };
  }
}

export async function discoverInstagramForCreators(
  handles: string[],
  perCreatorLimit = 10,
): Promise<DiscoveryResult> {
  if (handles.length === 0) {
    return { videos: [], cost_usd: 0, signal: 'creators_empty' };
  }
  const res = await runActor({
    username: handles.slice(0, 6),
    resultsType: 'posts',
    resultsLimit: perCreatorLimit,
    onlyPostsNewerThan: '60 days',
  });
  return {
    videos: res.videos.filter((v) => v.duration_seconds == null || v.duration_seconds <= 90),
    cost_usd: res.cost_usd,
    error: res.error,
    signal: res.error ? 'failed' : 'ok',
  };
}

export async function discoverInstagramForKeywords(
  terms: string[],
  perKeywordLimit = 10,
): Promise<DiscoveryResult> {
  if (terms.length === 0) {
    return { videos: [], cost_usd: 0, signal: 'keywords_empty' };
  }
  const res = await runActor({
    search: terms.slice(0, 5).join(' '),
    searchType: 'hashtag',
    resultsType: 'posts',
    resultsLimit: perKeywordLimit,
  });
  return {
    videos: res.videos.filter((v) => v.duration_seconds == null || v.duration_seconds <= 90),
    cost_usd: res.cost_usd,
    error: res.error,
    signal: res.error ? 'failed' : 'ok',
  };
}
