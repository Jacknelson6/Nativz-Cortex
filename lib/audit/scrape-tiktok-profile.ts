/**
 * Scrape a TikTok profile via Apify (apidojo/tiktok-profile-scraper).
 *
 * Input shape — the actor rejects anything that isn't `startUrls` or `handles`.
 * We use `startUrls` with plain strings (confirmed working against @toastique).
 *
 * Output shape — per-video items use new field names as of actor build 0.0.699:
 *   { id, title (caption), views, likes, comments, shares, bookmarks,
 *     hashtags[], channel: { name, username, bio, avatar, followers,
 *     following, videos, verified, url }, video: { duration, cover,
 *     thumbnail, url }, uploadedAtFormatted, postPage }
 */

import {
  startApifyActorRun,
  waitForApifyRunSuccess,
  fetchApifyDatasetItems,
  getApifyRunFailureReason,
} from '@/lib/tiktok/apify-run';
import type { ProspectProfile, ProspectVideo } from './types';

const ACTOR_ID = 'apidojo/tiktok-profile-scraper';

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

interface TikTokChannel {
  id?: string;
  name?: string;
  username?: string;
  bio?: string;
  avatar?: string;
  verified?: boolean;
  url?: string;
  followers?: number;
  following?: number;
  videos?: number;
}

interface TikTokActorItem {
  id?: string;
  title?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  bookmarks?: number;
  hashtags?: string[];
  channel?: TikTokChannel;
  uploadedAt?: number;
  uploadedAtFormatted?: string;
  video?: { duration?: number; cover?: string; thumbnail?: string; url?: string };
  postPage?: string;
}

export interface TikTokProfileResult {
  profile: ProspectProfile;
  videos: ProspectVideo[];
}

/** Pull #tags out of a caption in case the actor's hashtags[] is empty. */
function extractHashtagsFromCaption(caption: string): string[] {
  if (!caption) return [];
  const matches = caption.match(/#(\w+)/g) ?? [];
  return matches.map((m) => m.slice(1));
}

export async function scrapeTikTokProfile(profileUrl: string): Promise<TikTokProfileResult> {
  const username = extractTikTokUsername(profileUrl);
  if (!username) throw new Error(`Could not extract TikTok username from: ${profileUrl}`);

  const apiKey = getApiKey();
  console.log(`[audit] Scraping TikTok profile @${username} via Apify (${ACTOR_ID})`);

  const runId = await startApifyActorRun(
    ACTOR_ID,
    {
      startUrls: [`https://www.tiktok.com/@${username}`],
      resultsPerPage: 30,
      excludePinnedPosts: false,
      shouldDownloadCovers: false,
      shouldDownloadVideos: false,
      shouldDownloadSlideshowImages: false,
    },
    apiKey,
  );

  if (!runId) throw new Error(`Failed to start Apify actor for TikTok @${username}`);

  const success = await waitForApifyRunSuccess(runId, apiKey, 240000, 3000);
  if (!success) {
    const reason = await getApifyRunFailureReason(runId, apiKey);
    throw new Error(`TikTok scrape failed for @${username}: ${reason}`);
  }

  const items = (await fetchApifyDatasetItems(runId, apiKey, 50)) as TikTokActorItem[];
  if (items.length === 0) {
    throw new Error(`No videos returned for TikTok @${username}. The profile may be private or have no public content.`);
  }

  // Profile info lives on every item under `channel` — pull from the first.
  const channel: TikTokChannel = items[0].channel ?? {};
  const canonicalUsername = channel.username ?? channel.name ?? username;
  const displayName = channel.name ?? canonicalUsername;

  const profile: ProspectProfile = {
    platform: 'tiktok',
    username: canonicalUsername,
    displayName,
    bio: channel.bio ?? '',
    followers: channel.followers ?? 0,
    following: channel.following ?? 0,
    likes: 0, // actor doesn't return lifetime heart count in this shape
    postsCount: channel.videos ?? items.length,
    avatarUrl: channel.avatar ?? null,
    profileUrl: channel.url ?? `https://www.tiktok.com/@${canonicalUsername}`,
    verified: channel.verified ?? false,
  };

  const videos: ProspectVideo[] = items
    .filter((item) => !!item.id)
    .map((item) => {
      const caption = item.title ?? '';
      const explicit = item.hashtags ?? [];
      const extracted = extractHashtagsFromCaption(caption);
      const mergedTags = Array.from(new Set([...explicit, ...extracted]));
      return {
        id: item.id ?? '',
        platform: 'tiktok' as const,
        description: caption,
        views: item.views ?? 0,
        likes: item.likes ?? 0,
        comments: item.comments ?? 0,
        shares: item.shares ?? 0,
        bookmarks: item.bookmarks ?? 0,
        duration: item.video?.duration ? Math.round(item.video.duration) : null,
        publishDate:
          item.uploadedAtFormatted ??
          (item.uploadedAt ? new Date(item.uploadedAt * 1000).toISOString() : null),
        hashtags: mergedTags,
        url: item.postPage ?? `https://www.tiktok.com/@${canonicalUsername}/video/${item.id}`,
        thumbnailUrl: item.video?.cover ?? item.video?.thumbnail ?? null,
        authorUsername: canonicalUsername,
        authorDisplayName: displayName,
        authorAvatar: channel.avatar ?? null,
        authorFollowers: channel.followers ?? 0,
      };
    })
    .slice(0, 30);

  console.log(`[audit] Scraped TikTok @${canonicalUsername}: ${profile.followers} followers, ${videos.length} videos`);
  return { profile, videos };
}
