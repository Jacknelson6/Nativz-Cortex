import type { ScrapedVideo, ScrapeOptions, ScrapeResult } from './types';

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is required for YouTube scraping');
  return key;
}

interface YTSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
  };
}

interface YTVideoStats {
  id?: string;
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: {
    duration?: string;
  };
}

interface YTChannelItem {
  id?: string;
  statistics?: {
    subscriberCount?: string;
  };
  snippet?: {
    thumbnails?: { default?: { url?: string } };
  };
}

/** Parse ISO 8601 duration (PT1M30S) to seconds */
function parseDuration(iso: string): number | null {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  return h * 3600 + m * 60 + s;
}

/** Map time_range to YouTube publishedAfter param */
function getPublishedAfter(timeRange?: string): string | undefined {
  const now = Date.now();
  const daysMap: Record<string, number> = {
    last_7_days: 7,
    last_30_days: 30,
    last_3_months: 90,
    last_6_months: 180,
    last_year: 365,
  };
  const days = timeRange ? daysMap[timeRange] : undefined;
  if (!days) return undefined;
  return new Date(now - days * 86400000).toISOString();
}

export async function scrapeYouTube(options: ScrapeOptions): Promise<ScrapeResult> {
  try {
    const apiKey = getApiKey();
    const maxResults = Math.min(options.maxResults ?? 50, 50);

    // Step 1: Search for short-form videos
    const searchParams = new URLSearchParams({
      part: 'snippet',
      q: options.query,
      type: 'video',
      videoDuration: 'short',
      maxResults: String(maxResults),
      order: 'viewCount',
      relevanceLanguage: options.language || 'en',
      key: apiKey,
    });
    const publishedAfter = getPublishedAfter(options.timeRange);
    if (publishedAfter) searchParams.set('publishedAfter', publishedAfter);

    const searchRes = await fetch(`${SEARCH_URL}?${searchParams}`);
    if (!searchRes.ok) {
      const text = await searchRes.text();
      throw new Error(`YouTube search API error ${searchRes.status}: ${text.substring(0, 200)}`);
    }
    const searchData = (await searchRes.json()) as { items?: YTSearchItem[] };
    const searchItems = searchData.items ?? [];
    if (searchItems.length === 0) {
      return { platform: 'youtube', videos: [] };
    }

    // Step 2: Get video stats
    const videoIds = searchItems
      .map(i => i.id?.videoId)
      .filter((id): id is string => !!id);

    const statsParams = new URLSearchParams({
      part: 'statistics,contentDetails',
      id: videoIds.join(','),
      key: apiKey,
    });
    const statsRes = await fetch(`${VIDEOS_URL}?${statsParams}`);
    const statsData = (await statsRes.json()) as { items?: YTVideoStats[] };
    const statsMap = new Map<string, YTVideoStats>();
    for (const item of statsData.items ?? []) {
      if (item.id) statsMap.set(item.id, item);
    }

    // Step 3: Get channel subscriber counts (batch)
    const channelIds = [...new Set(searchItems.map(i => i.snippet?.channelId).filter((c): c is string => !!c))];
    const channelMap = new Map<string, YTChannelItem>();
    // YouTube API allows up to 50 channel IDs per request
    if (channelIds.length > 0) {
      const chanParams = new URLSearchParams({
        part: 'statistics,snippet',
        id: channelIds.join(','),
        key: apiKey,
      });
      const chanRes = await fetch(`${CHANNELS_URL}?${chanParams}`);
      if (chanRes.ok) {
        const chanData = (await chanRes.json()) as { items?: YTChannelItem[] };
        for (const ch of chanData.items ?? []) {
          if (ch.id) channelMap.set(ch.id, ch);
        }
      }
    }

    // Step 4: Map to ScrapedVideo
    const videos: ScrapedVideo[] = [];
    for (const item of searchItems) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;
      const stats = statsMap.get(videoId);
      const channelId = item.snippet?.channelId ?? '';
      const channel = channelMap.get(channelId);
      const duration = stats?.contentDetails?.duration
        ? parseDuration(stats.contentDetails.duration)
        : null;

      // Skip long-form videos (> 180s)
      if (duration !== null && duration > 180) continue;

      videos.push({
        platform: 'youtube',
        platform_id: videoId,
        url: `https://www.youtube.com/shorts/${videoId}`,
        thumbnail_url: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url ?? null,
        title: item.snippet?.title ?? null,
        description: item.snippet?.description ?? null,
        views: parseInt(stats?.statistics?.viewCount ?? '0', 10),
        likes: parseInt(stats?.statistics?.likeCount ?? '0', 10),
        comments: parseInt(stats?.statistics?.commentCount ?? '0', 10),
        shares: 0,
        bookmarks: 0,
        author_username: item.snippet?.channelTitle ?? 'unknown',
        author_display_name: item.snippet?.channelTitle ?? null,
        author_avatar: channel?.snippet?.thumbnails?.default?.url ?? null,
        author_followers: parseInt(channel?.statistics?.subscriberCount ?? '0', 10),
        hashtags: extractHashtags(item.snippet?.title, item.snippet?.description),
        duration_seconds: duration,
        publish_date: item.snippet?.publishedAt ?? null,
      });
    }

    console.log(`[youtube-scraper] Scraped ${videos.length} shorts for "${options.query}"`);
    return { platform: 'youtube', videos };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[youtube-scraper] Error: ${msg}`);
    return { platform: 'youtube', videos: [], error: msg };
  }
}

function extractHashtags(...texts: (string | undefined | null)[]): string[] {
  const tags = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    const matches = text.matchAll(/#(\w+)/g);
    for (const m of matches) tags.add(m[1].toLowerCase());
  }
  return [...tags];
}
