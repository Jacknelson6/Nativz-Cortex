/**
 * Platform-native search for competitor social profiles.
 *
 * When the website scrape doesn't surface a brand's TikTok / IG / YT, we
 * try to find them by:
 *  - TikTok: Apify profile scraper with a guessed handle
 *  - Instagram: Apify profile scraper with a guessed handle
 *  - YouTube: Data API channel search (free, instant)
 *
 * No hallucination risk — every returned URL maps to a real profile that
 * the scraper confirmed exists. Trade-off: costs ~$0.01-0.02 per Apify
 * run and adds ~15-30s wall time (TT + IG run in parallel).
 */

import {
  startApifyActorRun,
  waitForApifyRunSuccess,
  fetchApifyDatasetItems,
} from '@/lib/tiktok/apify-run';
import type { AuditPlatform, SocialLink } from './types';

const TT_PROFILE_ACTOR = 'apidojo/tiktok-profile-scraper';
const IG_PROFILE_ACTOR = 'apify/instagram-profile-scraper';

function getApifyKey(): string {
  const k = process.env.APIFY_API_KEY;
  if (!k) throw new Error('APIFY_API_KEY required');
  return k;
}

function getYouTubeKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

/**
 * Turn a brand name like "Dr. Smoothie LLC" into 1-3 plausible social
 * handles: ["drsmoothie", "dr.smoothie", "dr_smoothie"].
 */
function guessHandles(brandName: string): string[] {
  const base = brandName
    .toLowerCase()
    .replace(/\b(llc|inc|co|corp|ltd|group|brand|brands)\b/gi, '')
    .trim();
  const noSpecial = base.replace(/[^a-z0-9]/g, '');
  const dotted = base.replace(/[^a-z0-9]/g, '.').replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');
  const underscored = base.replace(/[^a-z0-9]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of [noSpecial, dotted, underscored]) {
    if (h && !seen.has(h)) { seen.add(h); out.push(h); }
  }
  return out.slice(0, 3);
}

async function tryTikTokHandle(handle: string): Promise<SocialLink | null> {
  const key = getApifyKey();
  const url = `https://www.tiktok.com/@${handle}`;
  const runId = await startApifyActorRun(TT_PROFILE_ACTOR, { startUrls: [url] }, key);
  if (!runId) return null;
  const ok = await waitForApifyRunSuccess(runId, key, 60_000, 3000);
  if (!ok) return null;
  const items = await fetchApifyDatasetItems(runId, key, 3);
  if (items.length === 0) return null;
  const first = items[0] as { channel?: { username?: string } };
  const username = first?.channel?.username ?? handle;
  return { platform: 'tiktok', username, url: `https://www.tiktok.com/@${username}` };
}

async function tryInstagramHandle(handle: string): Promise<SocialLink | null> {
  const key = getApifyKey();
  const runId = await startApifyActorRun(IG_PROFILE_ACTOR, { usernames: [handle] }, key);
  if (!runId) return null;
  const ok = await waitForApifyRunSuccess(runId, key, 60_000, 3000);
  if (!ok) return null;
  const items = await fetchApifyDatasetItems(runId, key, 1);
  if (items.length === 0) return null;
  const first = items[0] as { username?: string };
  const username = first?.username ?? handle;
  return { platform: 'instagram', username, url: `https://www.instagram.com/${username}/` };
}

async function searchYouTubeChannel(brandName: string): Promise<SocialLink | null> {
  const key = getYouTubeKey();
  if (!key) return null;
  try {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'channel',
      q: brandName,
      maxResults: '3',
      key,
    });
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.items as { id?: { channelId?: string }; snippet?: { channelTitle?: string; customUrl?: string } }[] | undefined;
    if (!items || items.length === 0) return null;
    const best = items[0];
    const channelId = best.id?.channelId;
    if (!channelId) return null;
    const handle = best.snippet?.customUrl?.replace(/^@/, '') ?? channelId;
    return {
      platform: 'youtube',
      username: handle,
      url: best.snippet?.customUrl
        ? `https://www.youtube.com/@${handle}`
        : `https://www.youtube.com/channel/${channelId}`,
    };
  } catch {
    return null;
  }
}

/**
 * Search for a brand's social profiles on the given platforms. Uses Apify
 * for TikTok + IG (real scrapes, no hallucination) and the YouTube Data
 * API for YT. TikTok + IG run in parallel to keep wall time ~30s.
 *
 * Returns only profiles that were confirmed to exist.
 */
export async function searchCompetitorSocials(
  brandName: string,
  platforms: AuditPlatform[],
): Promise<SocialLink[]> {
  const handles = guessHandles(brandName);
  if (handles.length === 0) return [];

  const results: SocialLink[] = [];
  const jobs: Promise<void>[] = [];

  if (platforms.includes('tiktok')) {
    jobs.push(
      (async () => {
        for (const h of handles) {
          const found = await tryTikTokHandle(h);
          if (found) { results.push(found); return; }
        }
      })(),
    );
  }

  if (platforms.includes('instagram')) {
    jobs.push(
      (async () => {
        for (const h of handles) {
          const found = await tryInstagramHandle(h);
          if (found) { results.push(found); return; }
        }
      })(),
    );
  }

  if (platforms.includes('youtube')) {
    jobs.push(
      (async () => {
        const found = await searchYouTubeChannel(brandName);
        if (found) results.push(found);
      })(),
    );
  }

  await Promise.allSettled(jobs);

  if (results.length > 0) {
    console.log(
      `[audit] platform search for "${brandName}": found ${results.map((r) => `${r.platform}=@${r.username}`).join(', ')}`,
    );
  } else {
    console.log(`[audit] platform search for "${brandName}": no profiles found on ${platforms.join(', ')}`);
  }

  return results;
}
