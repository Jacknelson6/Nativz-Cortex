// lib/tiktok/search.ts — TikTok search via Apify + comments via tikwm + transcripts
//
// Uses Apify for search, tikwm.com API for comments, and existing
// transcript extractor for subtitles/Whisper transcription.

import { extractTikTokTranscript } from './scraper';
import { logUsage } from '@/lib/ai/usage';

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

/**
 * Search TikTok for videos via Apify actor, then enrich with comments + transcripts.
 */
export async function gatherTikTokData(
  query: string,
  _timeRange: string,
  volume: string = 'medium',
): Promise<TikTokSearchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('TikTok search skipped — APIFY_API_KEY not configured');
    return { videos: [], topHashtags: [], totalResults: 0 };
  }

  // Apify costs: ~$0.50-$2 at medium (100), ~$5-$16 at deep (500)
  // Social listening priority: comments are where the sentiment lives
  const maxResults = volume === 'deep' ? 500 : volume === 'medium' ? 100 : 15;

  try {
    // Step 1: Search via Apify actor
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQueries: [query],
          resultsPerPage: maxResults,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
          shouldDownloadSlideshowImages: false,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!runRes.ok) {
      console.error('Apify TikTok actor start failed:', runRes.status);
      return { videos: [], topHashtags: [], totalResults: 0 };
    }

    const runData = await runRes.json();
    const runId = runData?.data?.id;
    if (!runId) return { videos: [], topHashtags: [], totalResults: 0 };

    // Poll for completion (max 120s)
    const maxWait = 120000;
    const pollInterval = 3000;
    const startTime = Date.now();
    let runSucceeded = false;

    while (Date.now() - startTime < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!statusRes.ok) continue;
      const statusData = await statusRes.json();
      const status = statusData?.data?.status;
      if (status === 'SUCCEEDED') {
        runSucceeded = true;
        break;
      }
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        console.error('Apify TikTok run failed:', status);
        return { videos: [], topHashtags: [], totalResults: 0 };
      }
    }

    // Check status one final time after the loop in case the last poll showed success
    if (!runSucceeded) {
      try {
        const finalStatusRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (finalStatusRes.ok) {
          const finalStatusData = await finalStatusRes.json();
          runSucceeded = finalStatusData?.data?.status === 'SUCCEEDED';
        }
      } catch {
        // ignore final check error
      }
    }

    if (!runSucceeded) {
      console.error('Apify TikTok run timed out after', maxWait / 1000, 'seconds');
      return { videos: [], topHashtags: [], totalResults: 0 };
    }

    // Fetch results
    const datasetRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}&limit=${maxResults}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!datasetRes.ok) return { videos: [], topHashtags: [], totalResults: 0 };
    const items = await datasetRes.json();
    if (!Array.isArray(items) || items.length === 0) return { videos: [], topHashtags: [], totalResults: 0 };

    // Step 2: Parse base results
    const hashtagCounts: Record<string, number> = {};
    const baseVideos: {
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
    }[] = [];

    for (const item of items) {
      const row = item as Record<string, unknown>;
      const videoMeta = row.videoMeta as Record<string, unknown> | undefined;
      const coverUrl =
        (typeof row.cover === 'string' && row.cover) ||
        (typeof row.coverUrl === 'string' && row.coverUrl) ||
        (videoMeta && typeof videoMeta.coverUrl === 'string' && videoMeta.coverUrl) ||
        (typeof row.thumbnailUrl === 'string' && row.thumbnailUrl) ||
        (typeof row.thumbnail === 'string' && row.thumbnail) ||
        null;

      const hashtags = (item.hashtags ?? [])
        .map((h: { name?: string } | string) => typeof h === 'string' ? h : h.name ?? '')
        .filter(Boolean);
      for (const tag of hashtags) hashtagCounts[tag] = (hashtagCounts[tag] ?? 0) + 1;

      const uniqueId = item.authorMeta?.name ?? item.author?.uniqueId ?? '';
      const videoId = item.id ?? '';

      baseVideos.push({
        id: videoId,
        desc: (item.text ?? item.desc ?? '').slice(0, 1000),
        author: {
          uniqueId,
          nickname: item.authorMeta?.nickName ?? item.author?.nickname ?? '',
        },
        stats: {
          playCount: item.playCount ?? item.stats?.playCount ?? 0,
          diggCount: item.diggCount ?? item.stats?.diggCount ?? 0,
          commentCount: item.commentCount ?? item.stats?.commentCount ?? 0,
          shareCount: item.shareCount ?? item.stats?.shareCount ?? 0,
        },
        createTime: item.createTimeISO ? new Date(item.createTimeISO).getTime() / 1000 : (item.createTime ?? 0),
        music: item.musicMeta ? { title: item.musicMeta.musicName ?? '', authorName: item.musicMeta.musicAuthor ?? '' } : null,
        hashtags,
        videoUrl: item.videoUrl ?? null,
        tiktokUrl: `https://www.tiktok.com/@${uniqueId}/video/${videoId}`,
        coverUrl,
      });
    }

    // Step 3: Enrich with comments + transcripts (parallel, batched)
    // Social listening priority: get ALL comments possible — that's where sentiment lives
    const commentBatchSize = volume === 'deep' ? 20 : volume === 'medium' ? 15 : 5;
    const transcriptBatchSize = volume === 'deep' ? 30 : volume === 'medium' ? 15 : 3;

    // Sort by engagement for prioritizing enrichment
    const sorted = [...baseVideos].sort((a, b) =>
      (b.stats.playCount + b.stats.diggCount) - (a.stats.playCount + a.stats.diggCount),
    );

    // Fetch comments for top videos (batched to avoid rate limits)
    // Comments are the #1 priority — fetch for as many videos as possible
    // Matches VOLUME_CONFIG commentVideos: deep=100, medium=30, light=5
    const commentFetchCount = volume === 'deep' ? 100 : volume === 'medium' ? 30 : 5;
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
      // Small delay between batches
      if (i + commentBatchSize < topForComments.length) await new Promise((r) => setTimeout(r, 300));
    }

    // Fetch transcripts for top videos — matches VOLUME_CONFIG transcriptVideos: deep=30, medium=15, light=3
    const transcriptMap = new Map<string, string>();
    const topForTranscripts = sorted.slice(0, transcriptBatchSize);
    await Promise.allSettled(
      topForTranscripts.map(async (v) => {
        const transcript = await fetchTikTokTranscript(v.videoUrl ?? '', v.tiktokUrl);
        if (transcript) transcriptMap.set(v.id, transcript);
      }),
    );

    // Step 4: Assemble final results
    const videos: TikTokSearchVideo[] = baseVideos.map((v) => ({
      ...v,
      top_comments: commentsMap.get(v.id) ?? [],
      transcript: transcriptMap.get(v.id) ?? null,
    }));

    const topHashtags = Object.entries(hashtagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag]) => tag);

    logUsage({
      service: 'apify',
      model: 'tiktok-scraper',
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
