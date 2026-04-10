/**
 * Scrape a Facebook page using Apify raw fetch API.
 * Actor: apify/facebook-posts-scraper — scrapes posts with dates and engagement.
 */

import { startApifyActorRun, waitForApifyRunSuccess, fetchApifyDatasetItems } from '@/lib/tiktok/apify-run';
import type { ProspectProfile, ProspectVideo } from './types';

// Configurable actor — set FACEBOOK_SCRAPER_ACTOR to use a cheaper community actor
// e.g. "netdesignr/facebook-posts-scraper" or "scrapemesh/facebook-page-posts-scraper"
const ACTOR_ID = process.env.FACEBOOK_SCRAPER_ACTOR ?? 'apify/facebook-posts-scraper';

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
  // Page-level (varies by actor)
  pageName?: string;
  pageUrl?: string;
  pageLikes?: number;
  pageFollowers?: number;
  pageCategory?: string;
  pageProfilePicUrl?: string;
  pageVerified?: boolean;
  pageAbout?: string;
  // Some actors use these
  name?: string;
  about?: string;
  followers?: number;
  category?: string;
  profilePicture?: string;
  verified?: boolean;
  // Post-level
  postId?: string;
  postUrl?: string;
  postText?: string;
  text?: string;
  message?: string;
  description?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  reactions?: number;
  videoViews?: number;
  time?: string;
  date?: string;
  timestamp?: number;
  createdTime?: string;
  publishedAt?: string;
  type?: string;
  imageUrl?: string;
  videoUrl?: string;
  fullPicture?: string;
  url?: string;
  link?: string;
  // Alternative field names
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  reactionsCount?: number;
}

export interface FacebookProfileResult {
  profile: ProspectProfile;
  videos: ProspectVideo[];
}

export async function scrapeFacebookProfile(profileUrl: string): Promise<FacebookProfileResult> {
  const fullUrl = extractFacebookPage(profileUrl);
  const apiKey = getApiKey();

  console.log(`[audit] Scraping Facebook page ${fullUrl} via Apify actor: ${ACTOR_ID}`);

  // Build input — most actors accept startUrls, some accept urls
  const runId = await startApifyActorRun(
    ACTOR_ID,
    {
      startUrls: [{ url: fullUrl }],
      urls: [fullUrl],
      resultsLimit: 25,
      maxPosts: 25,
    },
    apiKey,
  );

  if (!runId) throw new Error(`Failed to start Apify actor for FB ${fullUrl}`);

  const success = await waitForApifyRunSuccess(runId, apiKey, 120000, 3000);
  if (!success) throw new Error(`Apify scrape timed out for FB page`);

  const rawItems = await fetchApifyDatasetItems(runId, apiKey, 50) as Array<FBPostItem & { error?: string; errorDescription?: string }>;
  if (rawItems.length === 0) {
    throw new Error('Facebook scrape returned no items — Meta may be blocking the actor.');
  }

  // Log first item keys for debugging different actor output formats
  console.log(`[audit] FB actor returned ${rawItems.length} items. First item keys: ${Object.keys(rawItems[0]).slice(0, 15).join(', ')}`);

  // apify/facebook-posts-scraper has been returning `{url, error, errorDescription}`
  // for most pages lately — Meta is actively blocking the extraction and the
  // actor surfaces it as per-item errors. Detect that case up front and throw
  // a descriptive error so the audit's failedPlatforms UI can surface the
  // real reason instead of silently producing a bogus empty profile.
  const allErrors = rawItems.every((item) => item.error && !item.postId && !item.name && !item.pageName);
  if (allErrors) {
    const firstError = rawItems[0];
    const desc = firstError.errorDescription?.toString().trim();
    throw new Error(
      desc
        ? `Facebook blocked the scrape: ${desc.slice(0, 200)}`
        : `Facebook scrape failed — Meta is blocking the actor (${firstError.error ?? 'unknown error'}).`,
    );
  }

  // Drop error-only items from the list so we don't accidentally treat them
  // as real posts downstream.
  const items = rawItems.filter((item) => !item.error || item.postId || item.name || item.pageName) as FBPostItem[];
  if (items.length === 0) {
    throw new Error('Facebook scrape returned only error items — nothing to report.');
  }

  // Extract page-level info — try multiple field name conventions
  const pageItem = items.find(i => i.pageName || i.pageFollowers || i.name || i.followers) ?? items[0];
  // Prefer actor's page name (original casing) over the lowercased URL slug.
  const rawPageName = pageItem.pageName ?? pageItem.name ?? null;
  const pageName = rawPageName ?? extractPageSlug(fullUrl);
  // Username: use the page's vanity name if available; fall back to URL slug.
  const username = rawPageName
    ? extractPageSlug(fullUrl) // URL slug is the true unique identifier
    : extractPageSlug(fullUrl);

  const profile: ProspectProfile = {
    platform: 'facebook',
    username,
    displayName: pageName,
    bio: pageItem.pageAbout ?? pageItem.about ?? pageItem.pageCategory ?? pageItem.category ?? '',
    followers: pageItem.pageFollowers ?? pageItem.followers ?? pageItem.pageLikes ?? 0,
    following: 0,
    likes: pageItem.pageLikes ?? 0,
    postsCount: items.length,
    avatarUrl: pageItem.pageProfilePicUrl ?? pageItem.profilePicture ?? null,
    profileUrl: fullUrl,
    verified: pageItem.pageVerified ?? pageItem.verified ?? false,
  };

  // Map posts — handle multiple field name conventions across actors
  const videos: ProspectVideo[] = items
    .filter(item => item.postId || item.postUrl || item.postText || item.text || item.message || item.url)
    .map(item => {
      const postDate = item.time ?? item.date ?? item.createdTime ?? item.publishedAt
        ?? (item.timestamp ? new Date(item.timestamp * 1000).toISOString() : null);
      const text = item.postText ?? item.text ?? item.message ?? item.description ?? '';

      return {
        id: item.postId ?? '',
        platform: 'facebook' as const,
        description: text,
        views: item.videoViews ?? 0,
        likes: item.likes ?? item.likesCount ?? item.reactions ?? item.reactionsCount ?? 0,
        comments: item.comments ?? item.commentsCount ?? 0,
        shares: item.shares ?? item.sharesCount ?? 0,
        bookmarks: 0,
        duration: null,
        publishDate: postDate,
        hashtags: extractHashtags(text),
        url: item.postUrl ?? item.url ?? item.link ?? fullUrl,
        thumbnailUrl: item.fullPicture ?? item.imageUrl ?? null,
        authorUsername: extractPageSlug(fullUrl),
        authorDisplayName: pageName,
        authorAvatar: profile.avatarUrl,
        authorFollowers: profile.followers,
      };
    })
    .slice(0, 25);

  console.log(`[audit] Scraped FB ${pageName}: ${profile.followers} followers, ${videos.length} posts`);
  return { profile, videos };
}

function extractPageSlug(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '').replace(/\/$/, '');
  } catch {
    return url;
  }
}

function extractHashtags(text?: string | null): string[] {
  if (!text) return [];
  return [...text.matchAll(/#(\w+)/g)].map(m => m[1].toLowerCase());
}
