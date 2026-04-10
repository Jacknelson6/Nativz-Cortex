/**
 * Scrape an Instagram profile via Apify. We fan out to TWO actors in parallel:
 *
 * 1. `apify/instagram-profile-scraper` with { usernames } → profile metadata
 *    (followers, bio, avatar, verification, etc.) — the profile actor does NOT
 *    return posts.
 * 2. `apify/instagram-scraper` with { directUrls, resultsType: 'posts' } → posts
 *    (caption, hashtags, likes, etc.) — the search actor does NOT return
 *    profile metadata in a useful shape.
 *
 * Neither actor alone is sufficient. Older code used apidojo/instagram-scraper-api
 * which silently returns zero items for our key inputs, which is why the audit
 * had no Instagram data.
 */

import {
  startApifyActorRun,
  waitForApifyRunSuccess,
  fetchApifyDatasetItems,
  getApifyRunFailureReason,
} from '@/lib/tiktok/apify-run';
import type { ProspectProfile, ProspectVideo } from './types';

const PROFILE_ACTOR_ID = 'apify/instagram-profile-scraper';
const POSTS_ACTOR_ID = 'apify/instagram-scraper';

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
  verified?: boolean;
  private?: boolean;
  igtvVideoCount?: number;
}

interface IGPostItem {
  id?: string;
  shortCode?: string;
  type?: string; // 'Video' | 'Reel' | 'Sidecar' | 'Image'
  caption?: string;
  hashtags?: string[];
  mentions?: string[];
  url?: string;
  commentsCount?: number;
  likesCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  videoDuration?: number;
  displayUrl?: string;
  timestamp?: string;
  ownerUsername?: string;
  ownerFullName?: string;
}

export interface InstagramProfileResult {
  profile: ProspectProfile;
  videos: ProspectVideo[];
}

function extractHashtagsFromCaption(caption: string): string[] {
  if (!caption) return [];
  const matches = caption.match(/#(\w+)/g) ?? [];
  return matches.map((m) => m.slice(1));
}

async function fetchProfile(username: string, apiKey: string): Promise<IGProfileItem | null> {
  const runId = await startApifyActorRun(PROFILE_ACTOR_ID, { usernames: [username] }, apiKey);
  if (!runId) return null;
  const ok = await waitForApifyRunSuccess(runId, apiKey, 240000, 3000);
  if (!ok) {
    const reason = await getApifyRunFailureReason(runId, apiKey);
    console.error(`[audit] IG profile actor failed for @${username}: ${reason}`);
    return null;
  }
  const items = (await fetchApifyDatasetItems(runId, apiKey, 5)) as IGProfileItem[];
  return items[0] ?? null;
}

async function fetchPosts(username: string, apiKey: string): Promise<IGPostItem[]> {
  const runId = await startApifyActorRun(
    POSTS_ACTOR_ID,
    {
      directUrls: [`https://www.instagram.com/${username}/`],
      resultsType: 'posts',
      resultsLimit: 30,
      addParentData: false,
    },
    apiKey,
  );
  if (!runId) return [];
  const ok = await waitForApifyRunSuccess(runId, apiKey, 240000, 3000);
  if (!ok) {
    const reason = await getApifyRunFailureReason(runId, apiKey);
    console.error(`[audit] IG posts actor failed for @${username}: ${reason}`);
    return [];
  }
  return (await fetchApifyDatasetItems(runId, apiKey, 50)) as IGPostItem[];
}

export async function scrapeInstagramProfile(profileUrl: string): Promise<InstagramProfileResult> {
  const username = extractInstagramUsername(profileUrl);
  if (!username) throw new Error(`Could not extract Instagram username from: ${profileUrl}`);

  const apiKey = getApiKey();
  console.log(`[audit] Scraping Instagram @${username} via Apify (profile + posts actors in parallel)`);

  const [profileData, postItems] = await Promise.all([
    fetchProfile(username, apiKey),
    fetchPosts(username, apiKey),
  ]);

  if (!profileData && postItems.length === 0) {
    throw new Error(`No data returned for IG @${username}. The profile may be private or not exist.`);
  }

  const firstPost = postItems[0];
  const canonicalUsername = profileData?.username ?? firstPost?.ownerUsername ?? username;
  const displayName = profileData?.fullName ?? firstPost?.ownerFullName ?? canonicalUsername;

  const profile: ProspectProfile = {
    platform: 'instagram',
    username: canonicalUsername,
    displayName,
    bio: profileData?.biography ?? '',
    followers: profileData?.followersCount ?? 0,
    following: profileData?.followsCount ?? 0,
    likes: 0,
    postsCount: profileData?.postsCount ?? postItems.length,
    avatarUrl: profileData?.profilePicUrlHD ?? profileData?.profilePicUrl ?? null,
    profileUrl: `https://www.instagram.com/${canonicalUsername}/`,
    verified: profileData?.verified ?? false,
  };

  // Map all post types — the scorecard needs captions from every post, including
  // carousel (Sidecar) and image posts, to judge caption/hashtag strategy.
  const videos: ProspectVideo[] = postItems
    .filter((p) => !!(p.shortCode ?? p.id))
    .map((p) => {
      const caption = p.caption ?? '';
      const explicit = p.hashtags ?? [];
      const extracted = extractHashtagsFromCaption(caption);
      const mergedTags = Array.from(new Set([...explicit, ...extracted]));
      const id = p.shortCode ?? p.id ?? '';
      return {
        id,
        platform: 'instagram' as const,
        description: caption,
        views: p.videoPlayCount ?? p.videoViewCount ?? 0,
        likes: p.likesCount ?? 0,
        comments: p.commentsCount ?? 0,
        shares: 0,
        bookmarks: 0,
        duration: p.videoDuration ? Math.round(p.videoDuration) : null,
        publishDate: p.timestamp ?? null,
        hashtags: mergedTags,
        url: p.url ?? `https://www.instagram.com/p/${id}/`,
        thumbnailUrl: p.displayUrl ?? null,
        authorUsername: p.ownerUsername ?? canonicalUsername,
        authorDisplayName: displayName,
        authorAvatar: profile.avatarUrl,
        authorFollowers: profile.followers,
      };
    })
    .slice(0, 30);

  console.log(`[audit] Scraped IG @${canonicalUsername}: ${profile.followers} followers, ${videos.length} posts`);
  return { profile, videos };
}
