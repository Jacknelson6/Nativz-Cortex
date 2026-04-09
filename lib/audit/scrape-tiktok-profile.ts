/**
 * Scrape a TikTok profile using Apify to get profile data + recent videos.
 * Uses the clockworks/free-tiktok-scraper actor.
 */

import { ApifyClient } from 'apify-client';
import type { ProspectProfile, ProspectVideo } from './types';

const ACTOR_ID = 'clockworks/free-tiktok-scraper';

function getApifyClient(): ApifyClient {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY is required for TikTok scraping');
  return new ApifyClient({ token });
}

/** Extract username from a TikTok URL like tiktok.com/@username */
export function extractTikTokUsername(url: string): string | null {
  const cleaned = url.trim();
  // Direct username (no URL)
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
  uniqueId?: string;
  nickname?: string;
  signature?: string;
  verified?: boolean;
  avatarThumb?: string;
  avatarMedium?: string;
  fans?: number;
  following?: number;
  heart?: number;
  videoCount?: number;
  // Video fields (when scraping user's videos)
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

  const client = getApifyClient();

  console.log(`[audit] Scraping TikTok profile @${username} via Apify`);

  const run = await client.actor(ACTOR_ID).call(
    {
      profiles: [username],
      resultsPerPage: 30,
      shouldDownloadCovers: false,
      shouldDownloadVideos: false,
    },
    { waitSecs: 120 },
  );

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const rawItems = items as TikTokProfileItem[];

  if (rawItems.length === 0) {
    throw new Error(`No data returned for @${username}. The profile may be private or not exist.`);
  }

  // Extract profile info from authorMeta of first video, or from profile-level fields
  const firstItem = rawItems[0];
  const authorMeta = firstItem.authorMeta;

  const profile: ProspectProfile = {
    username: authorMeta?.name ?? firstItem.uniqueId ?? username,
    displayName: authorMeta?.nickName ?? firstItem.nickname ?? username,
    bio: authorMeta?.signature ?? firstItem.signature ?? '',
    followers: authorMeta?.fans ?? firstItem.fans ?? 0,
    following: authorMeta?.following ?? firstItem.following ?? 0,
    likes: authorMeta?.heart ?? firstItem.heart ?? 0,
    postsCount: authorMeta?.video ?? firstItem.videoCount ?? 0,
    avatarUrl: authorMeta?.avatar ?? firstItem.avatarMedium ?? firstItem.avatarThumb ?? null,
    profileUrl: `https://www.tiktok.com/@${authorMeta?.name ?? username}`,
    verified: authorMeta?.verified ?? firstItem.verified ?? false,
  };

  // Map videos
  const videos: ProspectVideo[] = rawItems
    .filter(item => item.id || item.text || item.desc)
    .map(item => ({
      id: item.id ?? '',
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
    }))
    .slice(0, 30);

  console.log(`[audit] Scraped @${username}: ${profile.followers} followers, ${videos.length} videos`);

  return { profile, videos };
}
