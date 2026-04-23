/**
 * Scraper volume settings — single source of truth for per-platform scrape
 * counts. Reads from `scraper_settings` (singleton row id=1). On any failure
 * (row missing, DB unreachable), falls back to the historical `medium` tier
 * defaults so searches never wedge.
 *
 * See migration 148_scraper_settings.sql.
 */

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
export { PER_UNIT_COST_USD } from './scraper-cost-constants';
import { PER_UNIT_COST_USD } from './scraper-cost-constants';

export interface ScraperSettings {
  reddit: { posts: number; commentPosts: number };
  youtube: { videos: number; commentVideos: number; transcriptVideos: number };
  tiktok: { videos: number; commentVideos: number; transcriptVideos: number };
  web: { results: number };
  quora: { threads: number };
}

export const SCRAPER_DEFAULTS: ScraperSettings = {
  reddit: { posts: 100, commentPosts: 15 },
  youtube: { videos: 100, commentVideos: 30, transcriptVideos: 20 },
  tiktok: { videos: 200, commentVideos: 30, transcriptVideos: 50 },
  web: { results: 30 },
  quora: { threads: 25 },
};

let cached: { value: ScraperSettings; expiresAt: number } | null = null;
const TTL_MS = 30_000;

// Per-unit cost constants now live in ./scraper-cost-constants (client-safe)
// so components with 'use client' can import them without pulling in the
// server-only createAdminClient path above.

export async function getScraperSettings(): Promise<ScraperSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('scraper_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) {
      cached = { value: SCRAPER_DEFAULTS, expiresAt: now + TTL_MS };
      return SCRAPER_DEFAULTS;
    }

    const value: ScraperSettings = {
      reddit: {
        posts: Number(data.reddit_posts ?? SCRAPER_DEFAULTS.reddit.posts),
        commentPosts: Number(data.reddit_comments_per_post ?? SCRAPER_DEFAULTS.reddit.commentPosts),
      },
      youtube: {
        videos: Number(data.youtube_videos ?? SCRAPER_DEFAULTS.youtube.videos),
        commentVideos: Number(data.youtube_comment_videos ?? SCRAPER_DEFAULTS.youtube.commentVideos),
        transcriptVideos: Number(data.youtube_transcript_videos ?? SCRAPER_DEFAULTS.youtube.transcriptVideos),
      },
      tiktok: {
        videos: Number(data.tiktok_videos ?? SCRAPER_DEFAULTS.tiktok.videos),
        commentVideos: Number(data.tiktok_comment_videos ?? SCRAPER_DEFAULTS.tiktok.commentVideos),
        transcriptVideos: Number(data.tiktok_transcript_videos ?? SCRAPER_DEFAULTS.tiktok.transcriptVideos),
      },
      web: { results: Number(data.web_results ?? SCRAPER_DEFAULTS.web.results) },
      quora: { threads: Number(data.quora_threads ?? SCRAPER_DEFAULTS.quora.threads) },
    };

    cached = { value, expiresAt: now + TTL_MS };
    return value;
  } catch {
    return SCRAPER_DEFAULTS;
  }
}

/** Called by the admin settings form after an update, so the next read hits the new row. */
export function invalidateScraperSettingsCache(): void {
  cached = null;
}

export function estimateSearchCost(settings: ScraperSettings): {
  perPlatformUsd: Record<keyof ScraperSettings, number>;
  totalUsd: number;
} {
  const perPlatformUsd = {
    reddit: settings.reddit.posts * PER_UNIT_COST_USD.reddit,
    youtube: settings.youtube.videos * PER_UNIT_COST_USD.youtube,
    tiktok: settings.tiktok.videos * PER_UNIT_COST_USD.tiktok,
    web: settings.web.results * PER_UNIT_COST_USD.web,
    quora: settings.quora.threads * PER_UNIT_COST_USD.quora,
  };
  const totalUsd = Object.values(perPlatformUsd).reduce((a, b) => a + b, 0);
  return { perPlatformUsd, totalUsd };
}
