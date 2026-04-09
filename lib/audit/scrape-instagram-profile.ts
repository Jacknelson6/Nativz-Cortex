/**
 * Scrape an Instagram profile using Apify raw fetch API.
 * Actor: apify/instagram-profile-scraper (profile info + recent posts)
 */

import { startApifyActorRun, waitForApifyRunSuccess, fetchApifyDatasetItems } from '@/lib/tiktok/apify-run';
import type { ProspectProfile, ProspectVideo } from './types';

const ACTOR_ID = 'apidojo/instagram-scraper-api';

function getApiKey(): string {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY is required');
  return token;
}

/** Extract username from an Instagram URL */
export function extractInstagramUsername(url: string): string | null {
  const cleaned = url.trim();
  if (/^@?[\w.]+$/.test(cleaned)) return cleaned.replace(/^@/, '');
  try {
    const parsed = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`);
    const match = parsed.pathname.match(/^\/([\w.]+)/);
    if (match && !['p', 'reel', 'explore', 'stories', 'accounts'].includes(match[1])) {
      return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

interface IGProfileItem {
  id?: string;
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  profilePicUrl?: string;
  profilePicUrlHD?: string;
  isVerified?: boolean;
  // Post fields
  shortCode?: string;
  type?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  timestamp?: string;
  displayUrl?: string;
  videoUrl?: string;
  url?: string;
  hashtags?: string[];
  videoDuration?: number;
  ownerUsername?: string;
}

export interface InstagramProfileResult {
  profile: ProspectProfile;
  videos: ProspectVideo[];
}

export async function scrapeInstagramProfile(profileUrl: string): Promise<InstagramProfileResult> {
  const username = extractInstagramUsername(profileUrl);
  if (!username) throw new Error(`Could not extract Instagram username from: ${profileUrl}`);

  const apiKey = getApiKey();
  console.log(`[audit] Scraping Instagram profile @${username} via Apify`);

  const runId = await startApifyActorRun(
    ACTOR_ID,
    {
      usernames: [username],
      resultsLimit: 30,
    },
    apiKey,
  );

  if (!runId) throw new Error(`Failed to start Apify actor for IG @${username}`);

  const success = await waitForApifyRunSuccess(runId, apiKey, 120000, 3000);
  if (!success) throw new Error(`Apify scrape timed out for IG @${username}`);

  const items = await fetchApifyDatasetItems(runId, apiKey, 50) as IGProfileItem[];
  if (items.length === 0) {
    throw new Error(`No data returned for IG @${username}. The profile may be private.`);
  }

  // First item is usually the profile data
  const profileItem = items[0];

  const profile: ProspectProfile = {
    platform: 'instagram',
    username: profileItem.username ?? username,
    displayName: profileItem.fullName ?? username,
    bio: profileItem.biography ?? '',
    followers: profileItem.followersCount ?? 0,
    following: profileItem.followsCount ?? 0,
    likes: 0,
    postsCount: profileItem.postsCount ?? 0,
    avatarUrl: profileItem.profilePicUrlHD ?? profileItem.profilePicUrl ?? null,
    profileUrl: `https://www.instagram.com/${profileItem.username ?? username}/`,
    verified: profileItem.isVerified ?? false,
  };

  // Map posts — filter to video/reel content only
  const videos: ProspectVideo[] = items
    .filter(item => item.shortCode || item.type === 'Video' || item.type === 'Reel' || item.videoViewCount)
    .filter(item => item.shortCode !== undefined)
    .map(item => ({
      id: item.shortCode ?? item.id ?? '',
      platform: 'instagram' as const,
      description: item.caption ?? '',
      views: item.videoPlayCount ?? item.videoViewCount ?? 0,
      likes: item.likesCount ?? 0,
      comments: item.commentsCount ?? 0,
      shares: 0,
      bookmarks: 0,
      duration: item.videoDuration ? Math.round(item.videoDuration) : null,
      publishDate: item.timestamp ?? null,
      hashtags: item.hashtags ?? [],
      url: item.url ?? `https://www.instagram.com/reel/${item.shortCode}/`,
      thumbnailUrl: item.displayUrl ?? null,
      authorUsername: item.ownerUsername ?? username,
      authorDisplayName: profileItem.fullName ?? null,
      authorAvatar: profileItem.profilePicUrl ?? null,
      authorFollowers: profileItem.followersCount ?? 0,
    }))
    .slice(0, 30);

  console.log(`[audit] Scraped IG @${username}: ${profile.followers} followers, ${videos.length} videos`);
  return { profile, videos };
}
