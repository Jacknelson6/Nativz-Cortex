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
}

/**
 * Sane fallbacks — only hit when the `scraper_settings` row is missing OR the
 * DB is unreachable. Jack's explicit policy (2026-04-23): per-platform counts
 * come from admin settings, not from volume=deep/medium/shallow tiers. These
 * numbers should match the "medium" intuition but they are no longer tied to
 * any preset system. Update them if the product default shifts.
 */
export const SCRAPER_DEFAULTS: ScraperSettings = {
  reddit: { posts: 100, commentPosts: 15 },
  youtube: { videos: 100, commentVideos: 30, transcriptVideos: 20 },
  tiktok: { videos: 200, commentVideos: 30, transcriptVideos: 50 },
  web: { results: 30 },
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

// ── Live unit prices ────────────────────────────────────────────────────────
//
// Populated by POST /api/admin/scraper-settings/refresh-pricing from real
// apify_runs costs. Falls back to the hardcoded defaults when no refreshed
// row exists (fresh environment) or the DB is unreachable.

export interface UnitPrices {
  reddit: number;
  youtube: number;
  tiktok: number;
  web: number;
  refreshedAt: string | null;
}

export const DEFAULT_UNIT_PRICES: UnitPrices = {
  reddit: PER_UNIT_COST_USD.reddit,
  youtube: PER_UNIT_COST_USD.youtube,
  tiktok: PER_UNIT_COST_USD.tiktok,
  web: PER_UNIT_COST_USD.web,
  refreshedAt: null,
};

let cachedPrices: { value: UnitPrices; expiresAt: number } | null = null;
const PRICES_TTL_MS = 60_000;

export async function getUnitPrices(): Promise<UnitPrices> {
  const now = Date.now();
  if (cachedPrices && cachedPrices.expiresAt > now) return cachedPrices.value;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('scraper_unit_prices')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) {
      cachedPrices = { value: DEFAULT_UNIT_PRICES, expiresAt: now + PRICES_TTL_MS };
      return DEFAULT_UNIT_PRICES;
    }

    const value: UnitPrices = {
      reddit: Number(data.reddit_price_per_unit ?? DEFAULT_UNIT_PRICES.reddit),
      youtube: Number(data.youtube_price_per_unit ?? DEFAULT_UNIT_PRICES.youtube),
      tiktok: Number(data.tiktok_price_per_unit ?? DEFAULT_UNIT_PRICES.tiktok),
      web: Number(data.web_price_per_unit ?? DEFAULT_UNIT_PRICES.web),
      refreshedAt: (data.refreshed_at as string | null) ?? null,
    };
    cachedPrices = { value, expiresAt: now + PRICES_TTL_MS };
    return value;
  } catch {
    return DEFAULT_UNIT_PRICES;
  }
}

export function invalidateUnitPricesCache(): void {
  cachedPrices = null;
}

/**
 * Cost estimate. Pass `prices` from `getUnitPrices()` to use live numbers.
 * Omitting it falls back to the hardcoded constants — keeps older callers
 * working without forcing a round-trip.
 */
export function estimateSearchCost(
  settings: ScraperSettings,
  prices: UnitPrices = DEFAULT_UNIT_PRICES,
): {
  perPlatformUsd: Record<keyof ScraperSettings, number>;
  totalUsd: number;
} {
  const perPlatformUsd = {
    reddit: settings.reddit.posts * prices.reddit,
    youtube: settings.youtube.videos * prices.youtube,
    tiktok: settings.tiktok.videos * prices.tiktok,
    web: settings.web.results * prices.web,
  };
  const totalUsd = Object.values(perPlatformUsd).reduce((a, b) => a + b, 0);
  return { perPlatformUsd, totalUsd };
}
