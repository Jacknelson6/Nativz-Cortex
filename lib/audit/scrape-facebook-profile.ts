/**
 * Scrape a Facebook page via Apify. Two-actor parallel strategy — same
 * pattern Instagram uses because Meta blocks single-actor flows that try to
 * do both profile AND posts in one pass.
 *
 *   1. `apify/facebook-pages-scraper` — profile metadata (followers, bio,
 *      category, verified, avatar, cover photo, website, etc.). Verified
 *      working against Nike — returns rich data for public pages.
 *   2. `apify/facebook-reels-scraper` — Reels (short-form video content).
 *      Audit is explicitly scoped to short-form video, so Reels is the
 *      content axis we care about; posts-scraper has been unreliable for
 *      months as Meta fingerprinting catches up.
 *
 * Both actors run in parallel. If the pages actor returns `not_available`
 * (restricted page, region-locked, deleted) we throw with the actor's own
 * errorDescription so the audit's failedPlatforms UI surfaces the real
 * reason. If Reels fails but pages succeeds, we still return the profile
 * with an empty videos array — the profile card renders, the content
 * section is empty.
 */

import {
  startApifyActorRun,
  waitForApifyRunSuccess,
  fetchApifyDatasetItems,
  getApifyRunFailureReason,
} from '@/lib/tiktok/apify-run';
import type { ProspectProfile, ProspectVideo } from './types';

const PROFILE_ACTOR_ID = process.env.FACEBOOK_PAGES_SCRAPER_ACTOR ?? 'apify/facebook-pages-scraper';
const REELS_ACTOR_ID = process.env.FACEBOOK_REELS_SCRAPER_ACTOR ?? 'apify/facebook-reels-scraper';

function getApiKey(): string {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY is required');
  return token;
}

/** Extract full FB page URL from anything a user might paste. */
export function extractFacebookPage(url: string): string {
  const cleaned = url.trim();
  if (cleaned.startsWith('http')) return cleaned;
  if (cleaned.startsWith('www.')) return `https://${cleaned}`;
  return `https://www.facebook.com/${cleaned}`;
}

// ── Pages actor (profile metadata) ──

interface FBPageItem {
  // Success path (apify/facebook-pages-scraper shape)
  title?: string;
  pageName?: string;
  pageUrl?: string;
  facebookUrl?: string;
  pageId?: string;
  facebookId?: string;
  categories?: string[];
  category?: string;
  info?: string[];
  likes?: number;
  followers?: number;
  followings?: number;
  profilePictureUrl?: string;
  coverPhotoUrl?: string;
  websites?: string[];
  website?: string;
  phone?: string;
  creation_date?: string;
  ad_status?: string;
  confirmed_owner?: string;
  // Error path
  error?: string;
  errorDescription?: string;
}

async function fetchPageProfile(pageUrl: string, apiKey: string): Promise<FBPageItem | null> {
  console.log(`[audit] FB pages actor → ${pageUrl}`);
  const runId = await startApifyActorRun(
    PROFILE_ACTOR_ID,
    { startUrls: [{ url: pageUrl }] },
    apiKey,
  );
  if (!runId) return null;
  const ok = await waitForApifyRunSuccess(runId, apiKey, 180_000, 3_000);
  if (!ok) {
    const reason = await getApifyRunFailureReason(runId, apiKey);
    console.warn(`[audit] FB pages actor failed: ${reason}`);
    return null;
  }
  const items = (await fetchApifyDatasetItems(runId, apiKey, 5)) as FBPageItem[];
  return items[0] ?? null;
}

// ── Reels actor (video content) ──

interface FBReelMedia {
  id?: string;
  playable_duration_in_ms?: number;
  first_frame_thumbnail?: string;
}

interface FBReelItem {
  id?: string;
  topLevelReelUrl?: string;
  inputUrl?: string;
  text?: string;
  time?: string;
  playCount?: number;
  playCountRounded?: number;
  viewCount?: number;
  likes?: number;
  likesCount?: number;
  reactionCount?: number;
  comments?: number;
  commentsCount?: number;
  commentCount?: number;
  shares?: number;
  sharesCount?: number;
  shareCount?: number;
  video?: FBReelMedia;
  attachments?: Array<{ media?: FBReelMedia }>;
  error?: string;
}

async function fetchPageReels(pageUrl: string, apiKey: string): Promise<FBReelItem[]> {
  console.log(`[audit] FB reels actor → ${pageUrl}`);
  const runId = await startApifyActorRun(
    REELS_ACTOR_ID,
    {
      startUrls: [{ url: pageUrl }],
      resultsLimit: 25,
    },
    apiKey,
  );
  if (!runId) return [];
  const ok = await waitForApifyRunSuccess(runId, apiKey, 180_000, 3_000);
  if (!ok) {
    const reason = await getApifyRunFailureReason(runId, apiKey);
    console.warn(`[audit] FB reels actor failed: ${reason}`);
    return [];
  }
  const items = (await fetchApifyDatasetItems(runId, apiKey, 50)) as FBReelItem[];
  // Drop error-only items (reels scraper uses the same {url, error, errorDescription}
  // failure shape as the posts scraper).
  return items.filter((i) => !i.error && (i.topLevelReelUrl || i.id || i.text));
}

// ── Public API ──

export interface FacebookProfileResult {
  profile: ProspectProfile;
  videos: ProspectVideo[];
}

export async function scrapeFacebookProfile(profileUrl: string): Promise<FacebookProfileResult> {
  const fullUrl = extractFacebookPage(profileUrl);
  const apiKey = getApiKey();

  // Fan out to both actors in parallel.
  const [pageItem, reelItems] = await Promise.all([
    fetchPageProfile(fullUrl, apiKey),
    fetchPageReels(fullUrl, apiKey),
  ]);

  // Pages actor came back with a meta-blocked error payload → surface it so
  // the failedPlatforms UI renders a descriptive message.
  if (pageItem?.error) {
    const desc = pageItem.errorDescription?.slice(0, 200) ?? pageItem.error;
    throw new Error(`Facebook blocked the scrape: ${desc}`);
  }

  if (!pageItem && reelItems.length === 0) {
    throw new Error('Facebook scrape returned no data — both actors failed. Meta may be blocking the page.');
  }

  // Prefer the page's vanity name over the URL slug so capitalisation is
  // preserved ("Toastique" not "toastiquedc").
  const displayName = pageItem?.title ?? extractPageSlug(fullUrl);
  const username = pageItem?.pageName ?? extractPageSlug(fullUrl);

  // Bio: the pages actor's `info` array holds lines like "Nike. 39,638,452 likes",
  // which is too noisy for a bio. Prefer the category label instead, falling
  // back to the first info line if there's no category.
  const bio =
    (pageItem?.categories && pageItem.categories.join(' · ')) ||
    pageItem?.category ||
    (pageItem?.info?.[0] ?? '');

  const profile: ProspectProfile = {
    platform: 'facebook',
    username,
    displayName,
    bio,
    followers: pageItem?.followers ?? pageItem?.likes ?? 0,
    following: pageItem?.followings ?? 0,
    likes: pageItem?.likes ?? 0,
    postsCount: reelItems.length,
    avatarUrl: pageItem?.profilePictureUrl ?? null,
    profileUrl: pageItem?.facebookUrl ?? pageItem?.pageUrl ?? fullUrl,
    verified: Boolean(pageItem?.confirmed_owner), // best proxy — pages-scraper doesn't return a verified flag
  };

  const videos: ProspectVideo[] = reelItems.slice(0, 25).map((item) => {
    // The reels actor nests the video under `video` OR inside `attachments[].media`.
    const media: FBReelMedia =
      item.video ??
      (Array.isArray(item.attachments) ? item.attachments[0]?.media : undefined) ??
      {};

    const caption = item.text ?? '';
    const id = media.id ?? item.id ?? '';
    const views = item.playCountRounded ?? item.playCount ?? item.viewCount ?? 0;
    const likes = item.likesCount ?? item.likes ?? item.reactionCount ?? 0;
    const comments = item.commentsCount ?? item.commentCount ?? item.comments ?? 0;
    const shares = item.sharesCount ?? item.shareCount ?? item.shares ?? 0;
    const duration = media.playable_duration_in_ms
      ? Math.round(media.playable_duration_in_ms / 1000)
      : null;

    return {
      id,
      platform: 'facebook' as const,
      description: caption,
      views,
      likes,
      comments,
      shares,
      bookmarks: 0,
      duration,
      publishDate: item.time ?? null,
      hashtags: extractHashtags(caption),
      url: item.topLevelReelUrl ?? fullUrl,
      thumbnailUrl: media.first_frame_thumbnail ?? null,
      authorUsername: username,
      authorDisplayName: displayName,
      authorAvatar: profile.avatarUrl,
      authorFollowers: profile.followers,
    };
  });

  console.log(`[audit] Scraped FB ${displayName}: ${profile.followers} followers, ${videos.length} reels`);
  return { profile, videos };
}

// ── Helpers ──

function extractPageSlug(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '').replace(/\/$/, '');
  } catch {
    return url;
  }
}

function extractHashtags(text?: string | null): string[] {
  if (!text) return [];
  return [...text.matchAll(/#(\w+)/g)].map((m) => m[1].toLowerCase());
}
