/**
 * VFF-03 T08: YouTube Shorts discovery via the YouTube Data API v3 `search`
 * endpoint. We filter for short-form by passing `videoDuration=short` and
 * appending `#shorts` to the keyword query when we have keyword signals.
 *
 * Quota: search.list costs 100 units; videos.list costs 1 unit per call. Daily
 * default quota is 10,000 units (100 searches/day). Caller (orchestrator)
 * watches for quota_exhausted via the `signal` field.
 */

import crypto from 'crypto';
import type { DiscoveredVideo, DiscoveryResult } from '../discovery-types';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function trimPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ['id', 'snippet', 'statistics', 'contentDetails']) {
    if (k in r) out[k] = r[k];
  }
  const str = JSON.stringify(out);
  if (str.length > 8192) return { ...out, truncated: true };
  return out;
}

function isoDurationToSeconds(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const mm = Number(m[2] ?? 0);
  const ss = Number(m[3] ?? 0);
  return h * 3600 + mm * 60 + ss;
}

type YTSearchItem = {
  id: { videoId?: string };
  snippet?: {
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
  };
};

type YTVideoItem = {
  id: string;
  snippet?: {
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: { duration?: string };
};

async function searchVideoIds(
  apiKey: string,
  params: Record<string, string>,
): Promise<{ ids: string[]; error?: string; quotaExhausted?: boolean }> {
  const search = new URLSearchParams({
    key: apiKey,
    part: 'id',
    type: 'video',
    videoDuration: 'short',
    maxResults: '25',
    ...params,
  });
  try {
    const res = await fetch(`${API_BASE}/search?${search.toString()}`);
    if (res.status === 403) {
      const body = await res.text();
      const quota = body.includes('quotaExceeded');
      return { ids: [], error: 'youtube 403', quotaExhausted: quota };
    }
    if (!res.ok) return { ids: [], error: `youtube ${res.status}` };
    const json = (await res.json()) as { items?: YTSearchItem[] };
    const ids = (json.items ?? [])
      .map((i) => i.id?.videoId)
      .filter((v): v is string => typeof v === 'string');
    return { ids };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'youtube fetch failed';
    return { ids: [], error: msg };
  }
}

async function hydrateVideos(
  apiKey: string,
  ids: string[],
): Promise<{ items: YTVideoItem[]; error?: string }> {
  if (ids.length === 0) return { items: [] };
  const params = new URLSearchParams({
    key: apiKey,
    id: ids.join(','),
    part: 'snippet,statistics,contentDetails',
  });
  try {
    const res = await fetch(`${API_BASE}/videos?${params.toString()}`);
    if (!res.ok) return { items: [], error: `youtube ${res.status}` };
    const json = (await res.json()) as { items?: YTVideoItem[] };
    return { items: json.items ?? [] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'youtube fetch failed';
    return { items: [], error: msg };
  }
}

function normalizeOne(item: YTVideoItem): DiscoveredVideo | null {
  if (!item.id) return null;
  const url = `https://www.youtube.com/shorts/${item.id}`;
  const dur = isoDurationToSeconds(item.contentDetails?.duration);
  // Shorts cap is 60s; tolerate up to 90s in case of metadata drift.
  if (dur != null && dur > 90) return null;
  const thumb =
    item.snippet?.thumbnails?.high?.url ??
    item.snippet?.thumbnails?.medium?.url ??
    item.snippet?.thumbnails?.default?.url ??
    null;
  return {
    platform: 'youtube',
    source_url: url,
    source_url_hash: hashUrl(url),
    external_post_id: item.id,
    creator_handle: item.snippet?.channelId ?? null,
    creator_display_name: item.snippet?.channelTitle ?? null,
    thumbnail_source_url: thumb,
    duration_seconds: dur,
    views_count: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
    likes_count: item.statistics?.likeCount ? Number(item.statistics.likeCount) : null,
    comments_count: item.statistics?.commentCount ? Number(item.statistics.commentCount) : null,
    shares_count: null,
    posted_at: item.snippet?.publishedAt ?? null,
    raw_payload: trimPayload(item),
  };
}

export async function discoverYouTubeForCreators(
  channelIds: string[],
  perChannelLimit = 10,
): Promise<DiscoveryResult> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) {
    return { videos: [], cost_usd: 0, error: 'YOUTUBE_DATA_API_KEY missing', signal: 'failed' };
  }
  if (channelIds.length === 0) {
    return { videos: [], cost_usd: 0, signal: 'creators_empty' };
  }
  const allIds: string[] = [];
  let quotaExhausted = false;
  let firstError: string | undefined;
  for (const channelId of channelIds.slice(0, 6)) {
    const r = await searchVideoIds(apiKey, {
      channelId,
      maxResults: String(perChannelLimit),
      order: 'date',
    });
    if (r.quotaExhausted) {
      quotaExhausted = true;
      break;
    }
    if (r.error && !firstError) firstError = r.error;
    allIds.push(...r.ids);
  }
  if (allIds.length === 0) {
    return {
      videos: [],
      cost_usd: 0,
      error: firstError,
      signal: quotaExhausted ? 'quota_exhausted' : firstError ? 'failed' : 'ok',
    };
  }
  const hydrated = await hydrateVideos(apiKey, allIds.slice(0, 50));
  const videos = hydrated.items
    .map(normalizeOne)
    .filter((v): v is DiscoveredVideo => v !== null);
  return {
    videos,
    cost_usd: 0, // YouTube Data API is quota-based, not $-priced.
    error: hydrated.error,
    signal: quotaExhausted ? 'quota_exhausted' : 'ok',
  };
}

export async function discoverYouTubeForKeywords(
  terms: string[],
  perKeywordLimit = 10,
): Promise<DiscoveryResult> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) {
    return { videos: [], cost_usd: 0, error: 'YOUTUBE_DATA_API_KEY missing', signal: 'failed' };
  }
  if (terms.length === 0) {
    return { videos: [], cost_usd: 0, signal: 'keywords_empty' };
  }
  const allIds: string[] = [];
  let quotaExhausted = false;
  let firstError: string | undefined;
  for (const term of terms.slice(0, 5)) {
    const r = await searchVideoIds(apiKey, {
      q: `${term} #shorts`,
      maxResults: String(perKeywordLimit),
      order: 'viewCount',
    });
    if (r.quotaExhausted) {
      quotaExhausted = true;
      break;
    }
    if (r.error && !firstError) firstError = r.error;
    allIds.push(...r.ids);
  }
  if (allIds.length === 0) {
    return {
      videos: [],
      cost_usd: 0,
      error: firstError,
      signal: quotaExhausted ? 'quota_exhausted' : firstError ? 'failed' : 'ok',
    };
  }
  const hydrated = await hydrateVideos(apiKey, allIds.slice(0, 50));
  const videos = hydrated.items
    .map(normalizeOne)
    .filter((v): v is DiscoveredVideo => v !== null);
  return {
    videos,
    cost_usd: 0,
    error: hydrated.error,
    signal: quotaExhausted ? 'quota_exhausted' : 'ok',
  };
}
