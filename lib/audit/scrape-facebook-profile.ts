/**
 * Scrape a Facebook page using Apify raw fetch API.
 * Actor: apify/facebook-pages-scraper
 */

import { startApifyActorRun, waitForApifyRunSuccess, fetchApifyDatasetItems } from '@/lib/tiktok/apify-run';
import type { ProspectProfile, ProspectVideo } from './types';

const ACTOR_ID = 'apify/facebook-pages-scraper';

function getApiKey(): string {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY is required');
  return token;
}

/** Extract Facebook page name from URL */
export function extractFacebookPage(url: string): string | null {
  const cleaned = url.trim();
  if (/^[\w.]+$/.test(cleaned)) return cleaned;
  try {
    const parsed = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`);
    const match = parsed.pathname.match(/^\/([\w.]+)/);
    if (match && !['share', 'sharer', 'login', 'watch', 'groups', 'events', 'marketplace'].includes(match[1])) {
      return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

interface FBPageItem {
  // Page info
  title?: string;
  name?: string;
  pageUrl?: string;
  likes?: number;
  followers?: number;
  about?: string;
  categories?: string[];
  profilePicture?: string;
  verified?: boolean;
  // Post fields
  postId?: string;
  postUrl?: string;
  text?: string;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  videoViewCount?: number;
  date?: string;
  type?: string;
  imageUrl?: string;
  videoUrl?: string;
}

export interface FacebookProfileResult {
  profile: ProspectProfile;
  videos: ProspectVideo[];
}

export async function scrapeFacebookProfile(profileUrl: string): Promise<FacebookProfileResult> {
  const pageName = extractFacebookPage(profileUrl);
  if (!pageName) throw new Error(`Could not extract Facebook page from: ${profileUrl}`);

  const apiKey = getApiKey();
  const fullUrl = profileUrl.startsWith('http') ? profileUrl : `https://www.facebook.com/${pageName}`;

  console.log(`[audit] Scraping Facebook page ${pageName} via Apify`);

  const runId = await startApifyActorRun(
    ACTOR_ID,
    {
      startUrls: [{ url: fullUrl }],
      resultsLimit: 30,
    },
    apiKey,
  );

  if (!runId) throw new Error(`Failed to start Apify actor for FB ${pageName}`);

  const success = await waitForApifyRunSuccess(runId, apiKey, 120000, 3000);
  if (!success) throw new Error(`Apify scrape timed out for FB ${pageName}`);

  const items = await fetchApifyDatasetItems(runId, apiKey, 50) as FBPageItem[];
  if (items.length === 0) {
    throw new Error(`No data returned for FB ${pageName}.`);
  }

  // Extract page-level info from first item
  const firstItem = items[0];

  const profile: ProspectProfile = {
    platform: 'facebook',
    username: pageName,
    displayName: firstItem.title ?? firstItem.name ?? pageName,
    bio: firstItem.about ?? '',
    followers: firstItem.followers ?? firstItem.likes ?? 0,
    following: 0,
    likes: firstItem.likes ?? 0,
    postsCount: items.length,
    avatarUrl: firstItem.profilePicture ?? null,
    profileUrl: fullUrl,
    verified: firstItem.verified ?? false,
  };

  // Map posts — include video posts
  const videos: ProspectVideo[] = items
    .filter(item => item.postId || item.postUrl)
    .map(item => ({
      id: item.postId ?? '',
      platform: 'facebook' as const,
      description: item.text ?? '',
      views: item.videoViewCount ?? 0,
      likes: item.likesCount ?? 0,
      comments: item.commentsCount ?? 0,
      shares: item.sharesCount ?? 0,
      bookmarks: 0,
      duration: null,
      publishDate: item.date ?? null,
      hashtags: extractHashtags(item.text),
      url: item.postUrl ?? `https://www.facebook.com/${pageName}`,
      thumbnailUrl: item.imageUrl ?? null,
      authorUsername: pageName,
      authorDisplayName: firstItem.title ?? firstItem.name ?? null,
      authorAvatar: firstItem.profilePicture ?? null,
      authorFollowers: firstItem.followers ?? 0,
    }))
    .slice(0, 30);

  console.log(`[audit] Scraped FB ${pageName}: ${profile.followers} followers, ${videos.length} posts`);
  return { profile, videos };
}

function extractHashtags(text?: string | null): string[] {
  if (!text) return [];
  const matches = text.matchAll(/#(\w+)/g);
  return [...matches].map(m => m[1].toLowerCase());
}
