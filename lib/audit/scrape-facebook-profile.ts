/**
 * Scrape a Facebook page using Apify raw fetch API.
 * Actor: apify/facebook-posts-scraper — scrapes posts with dates and engagement.
 */

import { startApifyActorRun, waitForApifyRunSuccess, fetchApifyDatasetItems } from '@/lib/tiktok/apify-run';
import type { ProspectProfile, ProspectVideo } from './types';

const ACTOR_ID = 'apify/facebook-posts-scraper';

function getApiKey(): string {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY is required');
  return token;
}

/** Extract Facebook page URL */
export function extractFacebookPage(url: string): string {
  const cleaned = url.trim();
  if (cleaned.startsWith('http')) return cleaned;
  if (cleaned.startsWith('www.')) return `https://${cleaned}`;
  return `https://www.facebook.com/${cleaned}`;
}

interface FBPostItem {
  // Page-level
  pageName?: string;
  pageUrl?: string;
  pageLikes?: number;
  pageFollowers?: number;
  pageCategory?: string;
  pageProfilePicUrl?: string;
  pageVerified?: boolean;
  pageAbout?: string;
  // Post-level
  postId?: string;
  postUrl?: string;
  postText?: string;
  text?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  reactions?: number;
  videoViews?: number;
  time?: string;
  date?: string;
  timestamp?: number;
  type?: string;
  imageUrl?: string;
  videoUrl?: string;
  fullPicture?: string;
  // Alternative field names
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
}

export interface FacebookProfileResult {
  profile: ProspectProfile;
  videos: ProspectVideo[];
}

export async function scrapeFacebookProfile(profileUrl: string): Promise<FacebookProfileResult> {
  const fullUrl = extractFacebookPage(profileUrl);
  const apiKey = getApiKey();

  console.log(`[audit] Scraping Facebook page ${fullUrl} via Apify`);

  const runId = await startApifyActorRun(
    ACTOR_ID,
    {
      startUrls: [{ url: fullUrl }],
      resultsLimit: 30,
    },
    apiKey,
  );

  if (!runId) throw new Error(`Failed to start Apify actor for FB ${fullUrl}`);

  const success = await waitForApifyRunSuccess(runId, apiKey, 120000, 3000);
  if (!success) throw new Error(`Apify scrape timed out for FB page`);

  const items = await fetchApifyDatasetItems(runId, apiKey, 50) as FBPostItem[];
  if (items.length === 0) {
    throw new Error(`No data returned for Facebook page.`);
  }

  // Extract page-level info from first item that has it
  const pageItem = items.find(i => i.pageName || i.pageFollowers) ?? items[0];
  const pageName = pageItem.pageName ?? new URL(fullUrl).pathname.replace(/^\//, '').replace(/\/$/, '');

  const profile: ProspectProfile = {
    platform: 'facebook',
    username: pageName,
    displayName: pageItem.pageName ?? pageName,
    bio: pageItem.pageAbout ?? pageItem.pageCategory ?? '',
    followers: pageItem.pageFollowers ?? pageItem.pageLikes ?? 0,
    following: 0,
    likes: pageItem.pageLikes ?? 0,
    postsCount: items.length,
    avatarUrl: pageItem.pageProfilePicUrl ?? null,
    profileUrl: fullUrl,
    verified: pageItem.pageVerified ?? false,
  };

  // Map posts
  const videos: ProspectVideo[] = items
    .filter(item => item.postId || item.postUrl || item.postText || item.text)
    .map(item => {
      const postDate = item.time ?? item.date ?? (item.timestamp ? new Date(item.timestamp * 1000).toISOString() : null);
      const text = item.postText ?? item.text ?? '';

      return {
        id: item.postId ?? '',
        platform: 'facebook' as const,
        description: text,
        views: item.videoViews ?? 0,
        likes: item.likes ?? item.likesCount ?? item.reactions ?? 0,
        comments: item.comments ?? item.commentsCount ?? 0,
        shares: item.shares ?? item.sharesCount ?? 0,
        bookmarks: 0,
        duration: null,
        publishDate: postDate,
        hashtags: extractHashtags(text),
        url: item.postUrl ?? fullUrl,
        thumbnailUrl: item.fullPicture ?? item.imageUrl ?? null,
        authorUsername: pageName,
        authorDisplayName: pageItem.pageName ?? null,
        authorAvatar: pageItem.pageProfilePicUrl ?? null,
        authorFollowers: profile.followers,
      };
    })
    .slice(0, 30);

  console.log(`[audit] Scraped FB ${pageName}: ${profile.followers} followers, ${videos.length} posts`);
  return { profile, videos };
}

function extractHashtags(text?: string | null): string[] {
  if (!text) return [];
  return [...text.matchAll(/#(\w+)/g)].map(m => m[1].toLowerCase());
}
