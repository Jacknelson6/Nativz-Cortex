// lib/tiktok/search.ts — TikTok search via Apify actor
//
// Uses the "clockworks/tiktok-scraper" actor on Apify to search TikTok
// for videos + comments. Runs are async — we start the run, then poll
// for results with a timeout.
//
// Cost: ~$0.01-0.05 per search depending on volume

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
 * Search TikTok for videos via Apify actor.
 * Falls back gracefully if Apify key not configured or actor fails.
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

  const maxResults = volume === 'deep' ? 50 : 20;

  try {
    // Start the Apify actor run
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

    // Fetch results from the dataset
    const datasetRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}&limit=${maxResults}`,
      { signal: AbortSignal.timeout(10000) },
    );

    if (!datasetRes.ok) return { videos: [], topHashtags: [], totalResults: 0 };
    const items = await datasetRes.json();

    if (!Array.isArray(items) || items.length === 0) {
      return { videos: [], topHashtags: [], totalResults: 0 };
    }

    // Parse results
    const hashtagCounts: Record<string, number> = {};
    const videos: TikTokSearchVideo[] = [];

    for (const item of items) {
      const hashtags = (item.hashtags ?? [])
        .map((h: { name?: string } | string) => typeof h === 'string' ? h : h.name ?? '')
        .filter(Boolean);

      for (const tag of hashtags) {
        hashtagCounts[tag] = (hashtagCounts[tag] ?? 0) + 1;
      }

      videos.push({
        id: item.id ?? '',
        desc: (item.text ?? item.desc ?? '').slice(0, 1000),
        author: {
          uniqueId: item.authorMeta?.name ?? item.author?.uniqueId ?? '',
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
        top_comments: [], // Comments require separate actor — skip for now
      });
    }

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
