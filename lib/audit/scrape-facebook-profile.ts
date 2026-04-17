/**
 * Scrape a Facebook page via Apify. Two-actor parallel strategy — same
 * pattern Instagram uses because Meta blocks single-actor flows that try to
 * do both profile AND posts in one pass.
 *
 *   1. Profile metadata — default `cleansyntax/facebook-profile-posts-scraper`
 *      with endpoint=`details_by_url`. Replaced the older
 *      `apify/facebook-pages-scraper` which had degraded against Meta's
 *      fingerprinting. Override with `FACEBOOK_PAGES_SCRAPER_ACTOR` env
 *      var to swap back; the actor-shape detection below handles both
 *      input/output formats.
 *   2. `apify/facebook-reels-scraper` — Reels (short-form video content).
 *      Audit is explicitly scoped to short-form video, so Reels is the
 *      content axis we care about.
 *
 * Both actors run in parallel. If the profile actor returns an error
 * payload (restricted page, region-locked, deleted) we throw with the
 * actor's own errorDescription so the audit's failedPlatforms UI surfaces
 * the real reason. If Reels fails but the profile succeeds, we still
 * return the profile with an empty videos array — the profile card
 * renders, the content section is empty.
 */

import {
  startApifyActorRun,
  waitForApifyRunSuccess,
  fetchApifyDatasetItems,
  getApifyRunFailureReason,
} from '@/lib/tiktok/apify-run';
import type { ProspectProfile, ProspectVideo } from './types';
import { collectBioLinks } from './scrape-helpers';

const PROFILE_ACTOR_ID =
  process.env.FACEBOOK_PAGES_SCRAPER_ACTOR ?? 'cleansyntax/facebook-profile-posts-scraper';
const REELS_ACTOR_ID = process.env.FACEBOOK_REELS_SCRAPER_ACTOR ?? 'apify/facebook-reels-scraper';

/** Detect the cleansyntax actor's input shape (endpoint + urls_text). */
function usesCleansyntaxInput(actorId: string): boolean {
  return /cleansyntax\/facebook-profile-posts-scraper/i.test(actorId);
}

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

// ── Profile actor (metadata) ──

/**
 * Union of fields returned by both supported profile actors. Field-name
 * conventions differ (camelCase for `apify/facebook-pages-scraper`,
 * snake_case for `cleansyntax/facebook-profile-posts-scraper`), and the
 * cleansyntax actor's output schema isn't exhaustively documented — so
 * every common naming variant is listed optional and the mapping below
 * picks the first non-empty match.
 */
interface FBPageItem {
  // Display name variants
  title?: string;
  name?: string;
  display_name?: string;

  // Username / vanity slug variants
  pageName?: string;
  page_name?: string;
  vanity?: string;
  username?: string;

  // Profile identifiers + URLs
  pageUrl?: string;
  facebookUrl?: string;
  profile_url?: string;
  url?: string;
  pageId?: string;
  facebookId?: string;
  profile_id?: string;

  // Categorisation + about
  categories?: string[];
  category?: string;
  info?: string[];
  about?: string;
  bio?: string;
  description?: string;

  // Counts — both casings
  likes?: number;
  likes_count?: number;
  followers?: number;
  followers_count?: number;
  followings?: number;
  following?: number;
  following_count?: number;

  // Imagery
  profilePictureUrl?: string;
  profile_picture_url?: string;
  profile_pic_url?: string;
  avatar?: string;
  avatar_url?: string;
  coverPhotoUrl?: string;
  cover_photo_url?: string;

  // External links
  websites?: string[];
  website?: string;

  // Verification — multiple flag names
  verified?: boolean;
  is_verified?: boolean;
  confirmed_owner?: string;

  // Error path (both actors surface errors in-band)
  error?: string;
  errorDescription?: string;
  error_description?: string;
}

async function fetchPageProfile(pageUrl: string, apiKey: string): Promise<FBPageItem | null> {
  const useCleansyntax = usesCleansyntaxInput(PROFILE_ACTOR_ID);
  console.log(`[audit] FB profile actor (${PROFILE_ACTOR_ID}) → ${pageUrl}`);

  const input = useCleansyntax
    ? { endpoint: 'details_by_url', urls_text: pageUrl }
    : { startUrls: [{ url: pageUrl }] };

  const runId = await startApifyActorRun(PROFILE_ACTOR_ID, input, apiKey);
  if (!runId) return null;
  const ok = await waitForApifyRunSuccess(runId, apiKey, 180_000, 3_000);
  if (!ok) {
    const reason = await getApifyRunFailureReason(runId, apiKey);
    console.warn(`[audit] FB profile actor failed: ${reason}`);
    return null;
  }
  const items = (await fetchApifyDatasetItems(runId, apiKey, 5)) as FBPageItem[];

  // Field-drift telemetry — log raw top-level keys once per run so actor
  // schema changes show up in logs before they silently produce empty cards.
  if (items[0]) {
    console.log(
      `[audit] FB profile raw keys: ${Object.keys(items[0]).join(', ')}`,
    );
  }

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

  // Profile actor came back with a meta-blocked error payload → surface it
  // so the failedPlatforms UI renders a descriptive message.
  if (pageItem?.error) {
    const desc =
      pageItem.errorDescription?.slice(0, 200) ??
      pageItem.error_description?.slice(0, 200) ??
      pageItem.error;
    throw new Error(`Facebook blocked the scrape: ${desc}`);
  }

  if (!pageItem && reelItems.length === 0) {
    throw new Error('Facebook scrape returned no data — both actors failed. Meta may be blocking the page.');
  }

  // Prefer the page's vanity name over the URL slug so capitalisation is
  // preserved ("Toastique" not "toastiquedc"). Field names differ between
  // actors — check each naming variant in priority order.
  const displayName =
    pageItem?.name ??
    pageItem?.title ??
    pageItem?.display_name ??
    extractPageSlug(fullUrl);
  const username =
    pageItem?.page_name ??
    pageItem?.pageName ??
    pageItem?.vanity ??
    pageItem?.username ??
    extractPageSlug(fullUrl);

  // Bio: the legacy pages actor's `info` array holds lines like "Nike.
  // 39,638,452 likes", which is too noisy for a bio. Prefer category →
  // about/bio/description → first info line.
  const bio =
    (pageItem?.categories && pageItem.categories.join(' · ')) ||
    pageItem?.category ||
    pageItem?.about ||
    pageItem?.bio ||
    pageItem?.description ||
    (pageItem?.info?.[0] ?? '');

  const profile: ProspectProfile = {
    platform: 'facebook',
    username,
    displayName,
    bio,
    followers:
      pageItem?.followers_count ??
      pageItem?.followers ??
      pageItem?.likes_count ??
      pageItem?.likes ??
      0,
    following:
      pageItem?.following_count ??
      pageItem?.following ??
      pageItem?.followings ??
      0,
    likes: pageItem?.likes_count ?? pageItem?.likes ?? 0,
    postsCount: reelItems.length,
    avatarUrl:
      pageItem?.profile_picture_url ??
      pageItem?.profilePictureUrl ??
      pageItem?.profile_pic_url ??
      pageItem?.avatar_url ??
      pageItem?.avatar ??
      null,
    profileUrl:
      pageItem?.profile_url ??
      pageItem?.facebookUrl ??
      pageItem?.pageUrl ??
      pageItem?.url ??
      fullUrl,
    verified: Boolean(
      pageItem?.is_verified ?? pageItem?.verified ?? pageItem?.confirmed_owner,
    ),
    bioLinks: collectBioLinks(bio, [
      pageItem?.website,
      ...(pageItem?.websites ?? []),
    ]),
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

  const missingThumbs = videos.filter((v) => !v.thumbnailUrl).length;
  const missingDates = videos.filter((v) => !v.publishDate).length;
  if (!profile.avatarUrl || missingThumbs > 0 || missingDates > 0) {
    console.warn(
      `[audit] FB ${displayName} field-health: ` +
        `avatar=${profile.avatarUrl ? 'ok' : 'MISSING'}, ` +
        `thumbnails=${videos.length - missingThumbs}/${videos.length}, ` +
        `publishDates=${videos.length - missingDates}/${videos.length}`,
    );
  }
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
