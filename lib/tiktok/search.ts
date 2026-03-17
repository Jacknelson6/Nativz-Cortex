// lib/tiktok/search.ts — TikTok search via Apify + comments via tikwm + transcripts
//
// Uses Apify for search, tikwm.com API for comments, and existing
// transcript extractor for subtitles/Whisper transcription.

import { extractTikTokTranscript } from './scraper';

export interface TikTokSearchVideo {
  id: string;
  desc: string;
  author: { uniqueId: string; nickname: string };
  stats: { playCount: number; diggCount: number; commentCount: number; shareCount: number };
  createTime: number;
  music: { title: string; authorName: string } | null;
  hashtags: string[];
  videoUrl: string | null;
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
  volume: 'quick' | 'deep' = 'quick',
): Promise<TikTokSearchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('TikTok search skipped — APIFY_API_KEY not configured');
    return { videos: [], topHashtags: [], totalResults: 0 };
  }

  const maxResults = volume === 'deep' ? 100 : 20;

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
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!runRes.ok) {
      console.error('Apify TikTok actor start failed:', runRes.status);
      return { videos: [], topHashtags: [], totalResults: 0 };
    }

    const runData = await runRes.json();
    const runId = runData?.data?.id;
    if (!runId) return { videos: [], topHashtags: [], totalResults: 0 };

    // Poll for completion (max 60s)
    const maxWait = 60000;
    const pollInterval = 3000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!statusRes.ok) continue;
      const statusData = await statusRes.json();
      const status = statusData?.data?.status;
      if (status === 'SUCCEEDED') break;
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        console.error('Apify TikTok run failed:', status);
        return { videos: [], topHashtags: [], totalResults: 0 };
      }
    }

    // If polling timed out without SUCCEEDED, don't fetch from an incomplete run
    if (Date.now() - startTime >= maxWait) {
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
    }[] = [];

    for (const item of items) {
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
      });
    }

    // Step 3: Enrich with comments + transcripts (parallel, batched)
    const commentBatchSize = volume === 'deep' ? 15 : 5;
    const transcriptBatchSize = volume === 'deep' ? 15 : 4;

    // Sort by engagement for prioritizing enrichment
    const sorted = [...baseVideos].sort((a, b) =>
      (b.stats.playCount + b.stats.diggCount) - (a.stats.playCount + a.stats.diggCount),
    );

    // Fetch comments for top videos (batched to avoid rate limits)
    const commentFetchCount = volume === 'deep' ? 40 : 20;
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

    // Fetch transcripts for top videos only (expensive)
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

    return { videos, topHashtags, totalResults: videos.length };
  } catch (err) {
    console.error('TikTok search error:', err);
    return { videos: [], topHashtags: [], totalResults: 0 };
  }
}
