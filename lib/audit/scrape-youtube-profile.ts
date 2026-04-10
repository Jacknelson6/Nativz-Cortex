/**
 * Scrape a YouTube channel using the YouTube Data API (no Apify needed).
 * Fetches channel info + recent short-form videos.
 */

import type { ProspectProfile, ProspectVideo } from './types';

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is required');
  return key;
}

/** Extract YouTube channel handle or ID from URL */
export function extractYouTubeChannel(url: string): { type: 'handle' | 'id'; value: string } | null {
  const cleaned = url.trim();
  // @handle format
  if (/^@[\w-]+$/.test(cleaned)) return { type: 'handle', value: cleaned };
  try {
    const parsed = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`);
    // youtube.com/@handle
    const handleMatch = parsed.pathname.match(/^\/@([\w-]+)/);
    if (handleMatch) return { type: 'handle', value: `@${handleMatch[1]}` };
    // youtube.com/channel/UCxxxxx
    const channelMatch = parsed.pathname.match(/^\/channel\/([\w-]+)/);
    if (channelMatch) return { type: 'id', value: channelMatch[1] };
    // youtube.com/c/name
    const cMatch = parsed.pathname.match(/^\/c\/([\w-]+)/);
    if (cMatch) return { type: 'handle', value: `@${cMatch[1]}` };
    // youtube.com/username (legacy)
    const userMatch = parsed.pathname.match(/^\/([\w-]+)$/);
    if (userMatch && !['watch', 'shorts', 'feed', 'results', 'playlist'].includes(userMatch[1])) {
      return { type: 'handle', value: `@${userMatch[1]}` };
    }
    return null;
  } catch {
    return null;
  }
}

function parseDuration(iso: string): number | null {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  return parseInt(match[1] || '0', 10) * 3600 + parseInt(match[2] || '0', 10) * 60 + parseInt(match[3] || '0', 10);
}

export interface YouTubeProfileResult {
  profile: ProspectProfile;
  videos: ProspectVideo[];
}

export async function scrapeYouTubeProfile(profileUrl: string): Promise<YouTubeProfileResult> {
  const channelInfo = extractYouTubeChannel(profileUrl);
  if (!channelInfo) throw new Error(`Could not extract YouTube channel from: ${profileUrl}`);

  const apiKey = getApiKey();
  console.log(`[audit] Scraping YouTube channel ${channelInfo.value} via Data API`);

  // Step 1: Get channel info
  const chanParams = new URLSearchParams({
    part: 'snippet,statistics',
    key: apiKey,
  });
  if (channelInfo.type === 'handle') {
    chanParams.set('forHandle', channelInfo.value.replace(/^@/, ''));
  } else {
    chanParams.set('id', channelInfo.value);
  }

  const chanRes = await fetch(`${CHANNELS_URL}?${chanParams}`, { signal: AbortSignal.timeout(15000) });
  if (!chanRes.ok) throw new Error(`YouTube API error ${chanRes.status}`);
  const chanData = await chanRes.json() as { items?: { id: string; snippet: { title: string; description: string; thumbnails: { default?: { url: string }; high?: { url: string } }; customUrl?: string }; statistics: { subscriberCount?: string; videoCount?: string; viewCount?: string } }[] };

  const channel = chanData.items?.[0];
  if (!channel) throw new Error(`YouTube channel not found: ${channelInfo.value}`);

  // YouTube returns customUrl and handle values with the '@' already prefixed
  // ('@toastique'). Strip it at storage time so the UI's own '@' prefix doesn't
  // produce '@@toastique'. Every other scraper normalises the same way.
  const rawUsername = channel.snippet.customUrl ?? channelInfo.value;
  const username = rawUsername.replace(/^@/, '');

  const profile: ProspectProfile = {
    platform: 'youtube',
    username,
    displayName: channel.snippet.title,
    bio: channel.snippet.description.substring(0, 300),
    followers: parseInt(channel.statistics.subscriberCount ?? '0', 10),
    following: 0,
    likes: 0,
    postsCount: parseInt(channel.statistics.videoCount ?? '0', 10),
    avatarUrl: channel.snippet.thumbnails.high?.url ?? channel.snippet.thumbnails.default?.url ?? null,
    profileUrl: `https://www.youtube.com/@${username}`,
    verified: false,
  };

  // Step 2: Get recent short-form videos from this channel
  const searchParams = new URLSearchParams({
    part: 'snippet',
    channelId: channel.id,
    type: 'video',
    videoDuration: 'short',
    maxResults: '30',
    order: 'date',
    key: apiKey,
  });

  const searchRes = await fetch(`${SEARCH_URL}?${searchParams}`, { signal: AbortSignal.timeout(15000) });
  if (!searchRes.ok) {
    console.error(`[audit] YouTube search failed: ${searchRes.status}`);
    return { profile, videos: [] };
  }

  const searchData = await searchRes.json() as { items?: { id?: { videoId?: string }; snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: { high?: { url?: string } } } }[] };
  const videoIds = (searchData.items ?? []).map(i => i.id?.videoId).filter((id): id is string => !!id);

  if (videoIds.length === 0) return { profile, videos: [] };

  // Step 3: Get video stats
  const statsParams = new URLSearchParams({
    part: 'statistics,contentDetails',
    id: videoIds.join(','),
    key: apiKey,
  });
  const statsRes = await fetch(`${VIDEOS_URL}?${statsParams}`, { signal: AbortSignal.timeout(15000) });
  const statsData = await statsRes.json() as { items?: { id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }; contentDetails?: { duration?: string } }[] };
  type StatsItem = NonNullable<typeof statsData.items>[number];
  const statsMap = new Map<string, StatsItem>();
  for (const item of statsData.items ?? []) statsMap.set(item.id, item);

  const videos: ProspectVideo[] = (searchData.items ?? [])
    .filter(item => item.id?.videoId)
    .map(item => {
      const videoId = item.id!.videoId!;
      const stats = statsMap.get(videoId);
      const duration = stats?.contentDetails?.duration ? parseDuration(stats.contentDetails.duration) : null;

      return {
        id: videoId,
        platform: 'youtube' as const,
        description: item.snippet?.title ?? item.snippet?.description ?? '',
        views: parseInt(stats?.statistics?.viewCount ?? '0', 10),
        likes: parseInt(stats?.statistics?.likeCount ?? '0', 10),
        comments: parseInt(stats?.statistics?.commentCount ?? '0', 10),
        shares: 0,
        bookmarks: 0,
        duration,
        publishDate: item.snippet?.publishedAt ?? null,
        hashtags: extractHashtags(item.snippet?.title),
        url: `https://www.youtube.com/shorts/${videoId}`,
        thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? null,
        authorUsername: username,
        authorDisplayName: channel.snippet.title,
        authorAvatar: channel.snippet.thumbnails.default?.url ?? null,
        authorFollowers: profile.followers,
      };
    })
    .filter(v => v.duration === null || v.duration <= 180)
    .slice(0, 30);

  console.log(`[audit] Scraped YT ${channelInfo.value}: ${profile.followers} subscribers, ${videos.length} shorts`);
  return { profile, videos };
}

function extractHashtags(text?: string | null): string[] {
  if (!text) return [];
  return [...text.matchAll(/#(\w+)/g)].map(m => m[1].toLowerCase());
}
