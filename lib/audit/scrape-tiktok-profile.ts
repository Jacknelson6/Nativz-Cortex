/**
 * Scrape a TikTok profile using Apify raw fetch API (no SDK — avoids proxy-agent issue on Vercel).
 */

import { startApifyActorRun, waitForApifyRunSuccess, fetchApifyDatasetItems } from '@/lib/tiktok/apify-run';
import type { ProspectProfile, ProspectVideo } from './types';

const ACTOR_ID = 'clockworks/free-tiktok-scraper';

function getApiKey(): string {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY is required for TikTok scraping');
  return token;
}

/** Extract username from a TikTok URL like tiktok.com/@username */
export function extractTikTokUsername(url: string): string | null {
  const cleaned = url.trim();
  if (/^@?[\w.]+$/.test(cleaned)) {
    return cleaned.replace(/^@/, '');
  }
  try {
    const parsed = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`);
    const match = parsed.pathname.match(/^\/@?([\w.]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

interface TikTokProfileItem {
  id?: string;
  text?: string;
  desc?: string;
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
  playCount?: number;
  collectCount?: number;
  webVideoUrl?: string;
  videoUrl?: string;
  covers?: { default?: string; origin?: string };
  hashtags?: { name?: string }[];
  videoMeta?: { duration?: number };
  createTime?: number;
  createTimeISO?: string;
  authorMeta?: {
    name?: string;
    nickName?: string;
    avatar?: string;
    fans?: number;
    following?: number;
    heart?: number;
    video?: number;
    verified?: boolean;
    signature?: string;
  };
}

export interface TikTokProfileResult {
  profile: ProspectProfile;
  videos: ProspectVideo[];
}

export async function scrapeTikTokProfile(profileUrl: string): Promise<TikTokProfileResult> {
  const username = extractTikTokUsername(profileUrl);
  if (!username) throw new Error(`Could not extract username from: ${profileUrl}`);

  const apiKey = getApiKey();

  console.log(`[audit] Scraping TikTok profile @${username} via Apify (raw fetch)`);

  const runId = await startApifyActorRun(
    ACTOR_ID,
    {
      profiles: [username],
      resultsPerPage: 30,
      shouldDownloadCovers: false,
      shouldDownloadVideos: false,
    },
    apiKey,
  );

  if (!runId) throw new Error(`Failed to start Apify actor for @${username}`);

  const success = await waitForApifyRunSuccess(runId, apiKey, 120000, 3000);
  if (!success) throw new Error(`Apify scrape timed out for @${username}`);

  const items = await fetchApifyDatasetItems(runId, apiKey, 50) as TikTokProfileItem[];
  if (items.length === 0) {
    throw new Error(`No data returned for @${username}. The profile may be private or not exist.`);
  }

  const firstItem = items[0];
  const authorMeta = firstItem.authorMeta;

  const profile: ProspectProfile = {
    platform: 'tiktok',
    username: authorMeta?.name ?? username,
    displayName: authorMeta?.nickName ?? username,
    bio: authorMeta?.signature ?? '',
    followers: authorMeta?.fans ?? 0,
    following: authorMeta?.following ?? 0,
    likes: authorMeta?.heart ?? 0,
    postsCount: authorMeta?.video ?? 0,
    avatarUrl: authorMeta?.avatar ?? null,
    profileUrl: `https://www.tiktok.com/@${authorMeta?.name ?? username}`,
    verified: authorMeta?.verified ?? false,
  };

  const videos: ProspectVideo[] = items
    .filter(item => item.id || item.text || item.desc)
    .map(item => ({
      id: item.id ?? '',
      platform: 'tiktok' as const,
      description: item.text ?? item.desc ?? '',
      views: item.playCount ?? 0,
      likes: item.diggCount ?? 0,
      comments: item.commentCount ?? 0,
      shares: item.shareCount ?? 0,
      bookmarks: item.collectCount ?? 0,
      duration: item.videoMeta?.duration ?? null,
      publishDate: item.createTimeISO ?? (item.createTime ? new Date(item.createTime * 1000).toISOString() : null),
      hashtags: (item.hashtags ?? []).map(h => h.name).filter((n): n is string => !!n),
      url: item.webVideoUrl ?? item.videoUrl ?? `https://www.tiktok.com/@${username}/video/${item.id}`,
      thumbnailUrl: item.covers?.default ?? item.covers?.origin ?? null,
      authorUsername: authorMeta?.name ?? username,
      authorDisplayName: authorMeta?.nickName ?? null,
      authorAvatar: authorMeta?.avatar ?? null,
      authorFollowers: authorMeta?.fans ?? 0,
    }))
    .slice(0, 30);

  console.log(`[audit] Scraped @${username}: ${profile.followers} followers, ${videos.length} videos`);
  return { profile, videos };
}
