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

async function tryTikTokHandle(handle: string, brandName: string): Promise<SocialLink | null> {
  const key = getApifyKey();
  const url = `https://www.tiktok.com/@${handle}`;
  const runId = await startApifyActorRun(TT_PROFILE_ACTOR, { startUrls: [url] }, key);
  if (!runId) return null;
  const ok = await waitForApifyRunSuccess(runId, key, 60_000, 3000);
  if (!ok) return null;
  const items = await fetchApifyDatasetItems(runId, key, 3);
  if (items.length === 0) return null;
  const first = items[0] as { channel?: { username?: string; name?: string } };
  const username = first?.channel?.username ?? handle;
  const displayName = first?.channel?.name ?? username;
  const sim = diceCoefficient(brandName, displayName);
  if (sim < 0.3) {
    console.log(`[audit] TikTok @${handle}: display name "${displayName}" doesn't match brand "${brandName}" (sim=${sim.toFixed(2)}) — skipping`);
    return null;
  }
  return { platform: 'tiktok', username, url: `https://www.tiktok.com/@${username}` };
}

async function tryInstagramHandle(handle: string, brandName: string): Promise<SocialLink | null> {
  const key = getApifyKey();
  const runId = await startApifyActorRun(IG_PROFILE_ACTOR, { usernames: [handle] }, key);
  if (!runId) return null;
  const ok = await waitForApifyRunSuccess(runId, key, 60_000, 3000);
  if (!ok) return null;
  const items = await fetchApifyDatasetItems(runId, key, 1);
  if (items.length === 0) return null;
  const first = items[0] as { username?: string; fullName?: string };
  const username = first?.username ?? handle;
  const displayName = first?.fullName ?? username;
  const sim = diceCoefficient(brandName, displayName);
  if (sim < 0.3) {
    console.log(`[audit] IG @${handle}: display name "${displayName}" doesn't match brand "${brandName}" (sim=${sim.toFixed(2)}) — skipping`);
    return null;
  }
  return { platform: 'instagram', username, url: `https://www.instagram.com/${username}/` };
}

/**
 * Dice coefficient on character bigrams — quick string similarity without
 * deps. Returns 0..1 where 1 = identical.
 */
function diceCoefficient(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bigramsA = new Map<string, number>();
  for (let i = 0; i < x.length - 1; i++) {
    const bi = x.slice(i, i + 2);
    bigramsA.set(bi, (bigramsA.get(bi) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < y.length - 1; i++) {
    const bi = y.slice(i, i + 2);
    const count = bigramsA.get(bi) ?? 0;
    if (count > 0) { overlap++; bigramsA.set(bi, count - 1); }
  }
  return (2 * overlap) / (x.length - 1 + y.length - 1);
}

/**
 * YouTube channel search with verification. Searches by brand name, then
 * ranks results by title similarity. Rejects channels whose title doesn't
 * resemble the brand (prevents picking "2stiq" for "Toastique").
 *
 * Also fetches subscriber counts for the top matches and picks the one
 * with the highest subs among those that pass the title-similarity check.
 */
async function searchYouTubeChannel(brandName: string): Promise<SocialLink | null> {
  const key = getYouTubeKey();
  if (!key) return null;
  try {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'channel',
      q: brandName,
      maxResults: '5',
      key,
    });
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.items as {
      id?: { channelId?: string };
      snippet?: { channelTitle?: string; customUrl?: string; description?: string };
    }[] | undefined;
    if (!items || items.length === 0) return null;

    // Score each result by title similarity to the brand name. Reject
    // anything below 0.4 — that's a "barely resembles the brand" threshold.
    const MIN_SIMILARITY = 0.4;
    const scored = items
      .filter((i) => i.id?.channelId && i.snippet?.channelTitle)
      .map((i) => ({
        channelId: i.id!.channelId!,
        title: i.snippet!.channelTitle!,
        customUrl: i.snippet!.customUrl ?? null,
        similarity: diceCoefficient(brandName, i.snippet!.channelTitle!),
      }))
      .filter((s) => s.similarity >= MIN_SIMILARITY)
      .sort((a, b) => b.similarity - a.similarity);

    if (scored.length === 0) return null;

    // Fetch subscriber counts for the top candidates so we can prefer the
    // most-followed match (the official account, not a fan channel).
    const channelIds = scored.slice(0, 3).map((s) => s.channelId);
    const statsParams = new URLSearchParams({
      part: 'statistics',
      id: channelIds.join(','),
      key,
    });
    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${statsParams}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const subsMap = new Map<string, number>();
    if (statsRes.ok) {
      const statsData = await statsRes.json();
      for (const ch of statsData.items ?? []) {
        subsMap.set(ch.id, parseInt(ch.statistics?.subscriberCount ?? '0', 10));
      }
    }

    // Pick the best: highest similarity first, then highest subs as tiebreaker
    const best = scored
      .map((s) => ({ ...s, subs: subsMap.get(s.channelId) ?? 0 }))
      .sort((a, b) => b.similarity - a.similarity || b.subs - a.subs)[0];

    if (!best) return null;
    const handle = best.customUrl?.replace(/^@/, '') ?? best.channelId;
    console.log(
      `[audit] YouTube search for "${brandName}": picked "${best.title}" (similarity=${best.similarity.toFixed(2)}, subs=${best.subs})`,
    );
    return {
      platform: 'youtube',
      username: handle,
      url: best.customUrl
        ? `https://www.youtube.com/@${handle}`
        : `https://www.youtube.com/channel/${best.channelId}`,
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
          const found = await tryTikTokHandle(h, brandName);
          if (found) { results.push(found); return; }
        }
      })(),
    );
  }

  if (platforms.includes('instagram')) {
    jobs.push(
      (async () => {
        for (const h of handles) {
          const found = await tryInstagramHandle(h, brandName);
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
