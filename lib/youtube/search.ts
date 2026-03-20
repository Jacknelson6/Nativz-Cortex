import { logUsage } from '@/lib/ai/usage';
// lib/youtube/search.ts — YouTube Data API v3 search + comment fetching
//
// Quota: 10,000 units/day free
// - search.list = 100 units per call
// - videos.list = 1 unit per call
// - commentThreads.list = 1 unit per call
// Quick search (25 videos) = ~136 units (~73 searches/day)
// Deep search (100 videos, 2 search pages) = ~342 units (~29 searches/day)

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  top_comments: YouTubeComment[];
  transcript: string | null;
}

export interface YouTubeComment {
  id: string;
  text: string;
  likeCount: number;
  authorName: string;
  publishedAt: string;
}

export interface YouTubeSearchResult {
  videos: YouTubeVideo[];
  totalResults: number;
}

const API_BASE = 'https://www.googleapis.com/youtube/v3';

function getApiKey(): string | null {
  return process.env.YOUTUBE_API_KEY || null;
}

function mapTimeRange(timeRange: string): string {
  const now = new Date();
  switch (timeRange) {
    case 'last_7_days': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case 'last_30_days': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case 'last_3_months': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    case 'last_6_months': return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
    case 'last_year': return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    default: return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
}

/**
 * Search YouTube for videos matching a query.
 * Cost: 100 quota units per search call. Paginates for >50 results.
 */
async function searchVideos(
  query: string,
  timeRange: string,
  maxResults: number = 25,
): Promise<{ videoIds: string[]; totalResults: number }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not configured');

  const publishedAfter = mapTimeRange(timeRange);
  const allVideoIds: string[] = [];
  let totalResults = 0;
  let pageToken: string | undefined;
  const pages = Math.ceil(Math.min(maxResults, 500) / 50);

  for (let page = 0; page < pages; page++) {
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      order: 'relevance',
      maxResults: String(Math.min(maxResults - allVideoIds.length, 50)),
      publishedAfter,
      relevanceLanguage: 'en',
      key: apiKey,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${API_BASE}/search?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('YouTube search failed:', res.status, err);
      if (page === 0) throw new Error(`YouTube search failed: ${res.status}`);
      break;
    }

    const data = await res.json();
    const videoIds = (data.items ?? [])
      .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
      .filter(Boolean) as string[];

    allVideoIds.push(...videoIds);
    totalResults = data.pageInfo?.totalResults ?? allVideoIds.length;
    pageToken = data.nextPageToken;

    if (!pageToken || allVideoIds.length >= maxResults) break;
  }

  return { videoIds: allVideoIds, totalResults };
}

type VideoDetails = { viewCount: number; likeCount: number; commentCount: number; title: string; description: string; channelTitle: string; channelId: string; publishedAt: string; thumbnailUrl: string };

/**
 * Fetch video details (stats) for a batch of video IDs.
 * Cost: 1 quota unit per call (up to 50 IDs per call).
 * Batches into chunks of 50 for >50 IDs.
 */
async function fetchVideoDetails(
  videoIds: string[],
): Promise<Map<string, VideoDetails>> {
  const apiKey = getApiKey();
  if (!apiKey) return new Map();

  const map = new Map<string, VideoDetails>();

  // YouTube videos.list accepts max 50 IDs per call
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: 'snippet,statistics',
      id: chunk.join(','),
      key: apiKey,
    });

    const res = await fetch(`${API_BASE}/videos?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) continue;
    const data = await res.json();

    for (const item of data.items ?? []) {
      const stats = item.statistics ?? {};
      const snippet = item.snippet ?? {};
      map.set(item.id, {
        viewCount: parseInt(stats.viewCount ?? '0', 10),
        likeCount: parseInt(stats.likeCount ?? '0', 10),
        commentCount: parseInt(stats.commentCount ?? '0', 10),
        title: snippet.title ?? '',
        description: (snippet.description ?? '').slice(0, 1000),
        channelTitle: snippet.channelTitle ?? '',
        channelId: snippet.channelId ?? '',
        publishedAt: snippet.publishedAt ?? '',
        thumbnailUrl: snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url ?? '',
      });
    }
  }

  return map;
}

/**
 * Fetch top comment threads for a video.
 * Cost: 1 quota unit per call.
 */
async function fetchVideoComments(
  videoId: string,
  maxResults: number = 10,
): Promise<YouTubeComment[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      videoId,
      order: 'relevance',
      maxResults: String(maxResults),
      textFormat: 'plainText',
      key: apiKey,
    });

    const res = await fetch(`${API_BASE}/commentThreads?${params}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return []; // Comments may be disabled
    const data = await res.json();

    return (data.items ?? []).map((item: {
      id: string;
      snippet: {
        topLevelComment: {
          snippet: {
            textDisplay: string;
            likeCount: number;
            authorDisplayName: string;
            publishedAt: string;
          };
        };
      };
    }) => ({
      id: item.id,
      text: item.snippet.topLevelComment.snippet.textDisplay.slice(0, 500),
      likeCount: item.snippet.topLevelComment.snippet.likeCount ?? 0,
      authorName: item.snippet.topLevelComment.snippet.authorDisplayName ?? '',
      publishedAt: item.snippet.topLevelComment.snippet.publishedAt ?? '',
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch YouTube captions/transcript for a video via the timedtext API.
 * Free — no quota cost.
 */
async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const xml = await res.text();
    const textMatches = xml.match(/<text[^>]*>([^<]*)<\/text>/g);
    if (!textMatches) return null;
    const text = textMatches
      .map((m) => {
        const content = m.replace(/<[^>]*>/g, '');
        return content.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      })
      .join(' ')
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

/**
 * Full YouTube data gathering — search + stats + comments + transcripts.
 * This is the main entry point for the platform router.
 *
 * Quota cost: ~136 units for quick (25 videos), ~342 for deep (100 videos)
 */
export async function gatherYouTubeData(
  query: string,
  timeRange: string,
  volume: string = 'medium',
): Promise<YouTubeSearchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('YouTube search skipped — YOUTUBE_API_KEY not configured');
    return { videos: [], totalResults: 0 };
  }

  // Smart split: YouTube gives good trend signals + transcripts are free
  // Quota: deep (~1,100 units), medium (~342 units), light (~70 units) — well within 10K/day free quota
  const maxResults = volume === 'deep' ? 500 : volume === 'medium' ? 100 : 15;
  const commentLimit = volume === 'deep' ? 100 : volume === 'medium' ? 30 : 5;

  // Step 1: Search for video IDs
  const { videoIds, totalResults } = await searchVideos(query, timeRange, maxResults);
  if (videoIds.length === 0) return { videos: [], totalResults: 0 };

  // Step 2: Fetch video details (stats) — single batched call
  const detailsMap = await fetchVideoDetails(videoIds);

  // Step 3: Fetch comments for top videos (by view count)
  const videosWithDetails = videoIds
    .map((id) => ({ id, details: detailsMap.get(id) }))
    .filter((v): v is { id: string; details: NonNullable<typeof v.details> } => !!v.details)
    .sort((a, b) => b.details.viewCount - a.details.viewCount);

  // Fetch comments for top most viewed videos — matches VOLUME_CONFIG commentVideos
  const commentFetchCount = volume === 'deep' ? 100 : volume === 'medium' ? 30 : 5;
  const topForComments = videosWithDetails.slice(0, commentFetchCount);

  const commentsMap = new Map<string, YouTubeComment[]>();
  await Promise.allSettled(
    topForComments.map(async (v) => {
      const comments = await fetchVideoComments(v.id, commentLimit);
      commentsMap.set(v.id, comments);
    }),
  );

  // Step 4: Fetch transcripts for top videos (free — no quota cost) — matches VOLUME_CONFIG transcriptVideos
  const transcriptCount = volume === 'deep' ? 50 : volume === 'medium' ? 20 : 3;
  const topForTranscripts = videosWithDetails.slice(0, transcriptCount);
  const transcriptMap = new Map<string, string>();
  await Promise.allSettled(
    topForTranscripts.map(async (v) => {
      const transcript = await fetchTranscript(v.id);
      if (transcript) transcriptMap.set(v.id, transcript);
    }),
  );

  // Step 5: Assemble final results
  const videos: YouTubeVideo[] = videosWithDetails.map((v) => ({
    id: v.id,
    title: v.details.title,
    description: v.details.description,
    channelTitle: v.details.channelTitle,
    channelId: v.details.channelId,
    publishedAt: v.details.publishedAt,
    thumbnailUrl: v.details.thumbnailUrl,
    viewCount: v.details.viewCount,
    likeCount: v.details.likeCount,
    commentCount: v.details.commentCount,
    top_comments: commentsMap.get(v.id) ?? [],
    transcript: transcriptMap.get(v.id) ?? null,
  }));

  logUsage({
    service: 'youtube',
    model: 'data-api-v3',
    feature: 'youtube_search',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  }).catch(() => {});

  return { videos, totalResults };
}
