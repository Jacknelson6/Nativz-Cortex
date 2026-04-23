// lib/tiktok/search.ts — TikTok search via Apify + comments via tikwm + transcripts
//
// Default Apify actor: apidojo/tiktok-scraper (~$0.30/1k posts, keyword search + sortType + dateRange + location).
// Set APIFY_TIKTOK_ACTOR_ID=clockworks~tiktok-scraper to use the legacy actor.
//
// Uses Apify for search, tikwm.com API for comments, and existing
// transcript extractor for subtitles/Whisper transcription.

import { extractTikTokTranscript } from './scraper';
import { logUsage } from '@/lib/ai/usage';
import { runAndLogApifyActor } from '@/lib/tiktok/apify-run';
import {
  buildApidojoInput,
  buildClockworksInput,
  getTikTokActorIdFromEnv,
  getTikTokInputMode,
  getTikTokSortPreferenceFromEnv,
} from '@/lib/tiktok/tiktok-apify-input';

export interface TikTokSearchVideo {
  id: string;
  desc: string;
  author: { uniqueId: string; nickname: string };
  stats: { playCount: number; diggCount: number; commentCount: number; shareCount: number };
  createTime: number;
  music: { title: string; authorName: string } | null;
  hashtags: string[];
  videoUrl: string | null;
  /** Cover image from Apify (when provided) */
  coverUrl: string | null;
  top_comments: TikTokComment[];
  transcript: string | null;
}

export interface TikTokComment {
  text: string;
  diggCount: number;
  createTime: number;
  user: string;
}

export interface TikTokSearchResult {
  videos: TikTokSearchVideo[];
  topHashtags: string[];
  totalResults: number;
}

type BaseVideoRow = {
  id: string;
  desc: string;
  author: { uniqueId: string; nickname: string };
  stats: { playCount: number; diggCount: number; commentCount: number; shareCount: number };
  createTime: number;
  music: { title: string; authorName: string } | null;
  hashtags: string[];
  videoUrl: string | null;
  tiktokUrl: string;
  coverUrl: string | null;
};

function getApiKey(): string | null {
  return process.env.APIFY_API_KEY || null;
}

/**
 * Fetch comments for a TikTok video via tikwm.com comment API.
 */
async function fetchTikTokComments(videoUrl: string, count: number = 10): Promise<TikTokComment[]> {
  try {
    const res = await fetch(
      `https://www.tikwm.com/api/comment/list?url=${encodeURIComponent(videoUrl)}&count=${count}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (json.code !== 0 || !json.data?.comments) return [];

    return (json.data.comments as Array<{
      text?: string;
      digg_count?: number;
      create_time?: number;
      user?: { unique_id?: string; nickname?: string };
    }>).map((c) => ({
      text: (c.text ?? '').slice(0, 500),
      diggCount: c.digg_count ?? 0,
      createTime: c.create_time ?? 0,
      user: c.user?.nickname ?? c.user?.unique_id ?? '',
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch transcript for a TikTok video using the existing extractor.
 */
async function fetchTikTokTranscript(videoUrl: string, tikTokUrl: string): Promise<string | null> {
  try {
    const result = await extractTikTokTranscript(tikTokUrl, videoUrl);
    return result.text || null;
  } catch {
    return null;
  }
}

function parseClockworksRow(item: Record<string, unknown>): BaseVideoRow | null {
  const videoMeta = item.videoMeta as Record<string, unknown> | undefined;
  const coverUrl =
    (typeof item.cover === 'string' && item.cover) ||
    (typeof item.coverUrl === 'string' && item.coverUrl) ||
    (videoMeta && typeof videoMeta.coverUrl === 'string' && videoMeta.coverUrl) ||
    (typeof item.thumbnailUrl === 'string' && item.thumbnailUrl) ||
    (typeof item.thumbnail === 'string' && item.thumbnail) ||
    null;

  const authorMeta = item.authorMeta as Record<string, unknown> | undefined;
  const author = item.author as Record<string, unknown> | undefined;
  const stats = item.stats as Record<string, unknown> | undefined;
  const musicMeta = item.musicMeta as Record<string, unknown> | undefined;

  const rawTags = item.hashtags;
  const hashtags = (Array.isArray(rawTags) ? rawTags : [])
    .map((h: { name?: string } | string) => (typeof h === 'string' ? h : h.name ?? ''))
    .filter(Boolean);

  const uniqueId = String(authorMeta?.name ?? author?.uniqueId ?? '');
  const videoId = String(item.id ?? '');
  if (!videoId) return null;

  return {
    id: videoId,
    desc: String(item.text ?? item.desc ?? '').slice(0, 1000),
    author: {
      uniqueId,
      nickname: String(authorMeta?.nickName ?? author?.nickname ?? ''),
    },
    stats: {
      playCount: Number(item.playCount ?? stats?.playCount ?? 0),
      diggCount: Number(item.diggCount ?? stats?.diggCount ?? 0),
      commentCount: Number(item.commentCount ?? stats?.commentCount ?? 0),
      shareCount: Number(item.shareCount ?? stats?.shareCount ?? 0),
    },
    createTime: item.createTimeISO
      ? new Date(String(item.createTimeISO)).getTime() / 1000
      : Number(item.createTime ?? 0),
    music: musicMeta
      ? {
          title: String(musicMeta.musicName ?? ''),
          authorName: String(musicMeta.musicAuthor ?? ''),
        }
      : null,
    hashtags,
    videoUrl: typeof item.videoUrl === 'string' ? item.videoUrl : null,
    tiktokUrl: `https://www.tiktok.com/@${uniqueId}/video/${videoId}`,
    coverUrl,
  };
}

function parseApidojoRow(item: Record<string, unknown>): BaseVideoRow | null {
  const id = String(item.id ?? '');
  if (!id) return null;

  const channel = item.channel as Record<string, unknown> | undefined;
  const uniqueId = String(channel?.username ?? channel?.name ?? '');
  const video = item.video as Record<string, unknown> | undefined;
  const postPage = typeof item.postPage === 'string' ? item.postPage : '';
  const tiktokUrl =
    postPage ||
    (uniqueId ? `https://www.tiktok.com/@${uniqueId}/video/${id}` : '');
  if (!tiktokUrl) return null;

  const hashtags = Array.isArray(item.hashtags)
    ? (item.hashtags as unknown[]).map((h) => String(h)).filter(Boolean)
    : [];

  const song = item.song as Record<string, unknown> | undefined;
  const music = song
    ? {
        title: String(song.title ?? ''),
        authorName: String(song.artist ?? ''),
      }
    : null;

  const views = typeof item.views === 'number' ? item.views : Number(item.views ?? 0);
  const likes = typeof item.likes === 'number' ? item.likes : Number(item.likes ?? 0);
  const comments = typeof item.comments === 'number' ? item.comments : Number(item.comments ?? 0);
  const shares = typeof item.shares === 'number' ? item.shares : Number(item.shares ?? 0);
  const uploadedAt = typeof item.uploadedAt === 'number' ? item.uploadedAt : Number(item.uploadedAt ?? 0);

  const coverFromVideo =
    (video && typeof video.cover === 'string' && video.cover) ||
    (video && typeof video.thumbnail === 'string' && video.thumbnail) ||
    null;

  return {
    id,
    desc: String(item.title ?? '').slice(0, 1000),
    author: {
      uniqueId,
      nickname: String(channel?.name ?? uniqueId),
    },
    stats: {
      playCount: views,
      diggCount: likes,
      commentCount: comments,
      shareCount: shares,
    },
    createTime: uploadedAt,
    music,
    hashtags,
    videoUrl: video && typeof video.url === 'string' ? video.url : null,
    tiktokUrl,
    coverUrl: coverFromVideo,
  };
}

export interface TikTokGatherCounts {
  /** Total videos to pull metadata for (cap). */
  videos: number;
  /** Of those, how many to pull comment threads for (top-by-engagement). */
  commentVideos: number;
  /** Of those, how many to transcribe (top-by-engagement). */
  transcriptVideos: number;
}

/**
 * Search TikTok via Apify, then enrich the top videos with comments +
 * transcripts. All counts are explicit — no volume tier; admin settings
 * are the source of truth. The platform router reads `scraper_settings`
 * and passes the counts here.
 *
 * Default actor: apidojo/tiktok-scraper (pay-per-result, ~$0.30/1k posts).
 * Override with APIFY_TIKTOK_ACTOR_ID for the legacy clockworks actor.
 */
export async function gatherTikTokData(
  query: string,
  timeRange: string,
  counts: TikTokGatherCounts,
): Promise<TikTokSearchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('TikTok search skipped — APIFY_API_KEY not configured');
    return { videos: [], topHashtags: [], totalResults: 0 };
  }

  const actorId = getTikTokActorIdFromEnv();
  const inputMode = getTikTokInputMode(actorId);
  const sortPref = getTikTokSortPreferenceFromEnv();

  let maxResults = Math.max(0, counts.videos);
  if (maxResults === 0) return { videos: [], topHashtags: [], totalResults: 0 };
  if (inputMode === 'apidojo') {
    // apidojo requires at least 10 items per keyword for stability.
    maxResults = Math.max(maxResults, 10);
  }

  try {
    const apifyInput =
      inputMode === 'clockworks'
        ? buildClockworksInput(query, maxResults, timeRange, sortPref)
        : buildApidojoInput(query, maxResults, timeRange, sortPref);

    // Wait budget scales with the target count — huge admin configs need
    // more Apify time, but 200 videos comfortably finishes in 3 minutes.
    const maxWaitMs = maxResults > 200 ? 300_000 : 180_000;
    const { runId, items: rawItems, succeeded } = await runAndLogApifyActor(
      actorId,
      apifyInput,
      apiKey,
      {
        maxWaitMs,
        pollIntervalMs: 3000,
        fetchLimit: maxResults,
        context: { purpose: 'tiktok_search' },
      },
    );
    if (!runId || !succeeded) return { videos: [], topHashtags: [], totalResults: 0 };
    const items = rawItems;
    if (!Array.isArray(items) || items.length === 0) return { videos: [], topHashtags: [], totalResults: 0 };

    const hashtagCounts: Record<string, number> = {};
    const baseVideos: BaseVideoRow[] = [];

    for (const raw of items) {
      const row = raw as Record<string, unknown>;
      const parsed =
        inputMode === 'clockworks' ? parseClockworksRow(row) : parseApidojoRow(row);
      if (!parsed) continue;
      for (const tag of parsed.hashtags) hashtagCounts[tag] = (hashtagCounts[tag] ?? 0) + 1;
      baseVideos.push(parsed);
    }

    if (baseVideos.length === 0) return { videos: [], topHashtags: [], totalResults: 0 };

    // Rank by (plays + likes) then slice for comments + transcripts.
    const sorted = [...baseVideos].sort(
      (a, b) => b.stats.playCount + b.stats.diggCount - (a.stats.playCount + a.stats.diggCount),
    );

    const commentFetchCount = Math.max(0, counts.commentVideos);
    const commentBatchSize = Math.min(20, Math.max(5, Math.ceil(commentFetchCount / 4)));
    const topForComments = sorted.slice(0, commentFetchCount);
    const commentsMap = new Map<string, TikTokComment[]>();
    for (let i = 0; i < topForComments.length; i += commentBatchSize) {
      const batch = topForComments.slice(i, i + commentBatchSize);
      const results = await Promise.allSettled(
        batch.map(async (v) => {
          const comments = await fetchTikTokComments(v.tiktokUrl, 10);
          return { id: v.id, comments };
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') commentsMap.set(r.value.id, r.value.comments);
      }
      // Inter-batch stagger removed — each batch is already
      // Promise.allSettled internally, so 300ms between batches just adds
      // wall-clock without protecting any rate limit (tikwm tolerates
      // bursts of ~15 concurrent fetches fine in practice).
    }

    // Transcripts: prefer embedded captions / tikwm (no marginal $). Groq Whisper only
    // runs when captions are missing. Cap from admin settings.
    const transcriptCap = Math.max(0, counts.transcriptVideos);
    const transcriptMap = new Map<string, string>();
    const transcriptTargets = sorted.slice(
      0,
      Math.min(sorted.length, maxResults, transcriptCap),
    );
    const transcriptChunk = 8;
    for (let i = 0; i < transcriptTargets.length; i += transcriptChunk) {
      const batch = transcriptTargets.slice(i, i + transcriptChunk);
      const results = await Promise.allSettled(
        batch.map(async (v) => {
          const transcript = await fetchTikTokTranscript(v.videoUrl ?? '', v.tiktokUrl);
          return { id: v.id, transcript };
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.transcript) {
          transcriptMap.set(r.value.id, r.value.transcript);
        }
      }
      // Inter-batch stagger removed — for medium volume that was 12 × 150ms
      // ≈ 1.8s of dead time per run; for deep volume ~3.6s. Batch is already
      // parallel internally; tikwm/Groq tolerate the burst.
    }

    const videos: TikTokSearchVideo[] = baseVideos.map((v) => ({
      ...v,
      top_comments: commentsMap.get(v.id) ?? [],
      transcript: transcriptMap.get(v.id) ?? null,
    }));

    const topHashtags = Object.entries(hashtagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag]) => tag);

    const modelLabel =
      inputMode === 'clockworks' ? 'clockworks-tiktok-scraper' : 'apidojo-tiktok-scraper';

    logUsage({
      service: 'apify',
      model: modelLabel,
      feature: 'tiktok_search',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    }).catch(() => {});

    return { videos, topHashtags, totalResults: videos.length };
  } catch (err) {
    console.error('TikTok search error:', err);
    return { videos: [], topHashtags: [], totalResults: 0 };
  }
}
