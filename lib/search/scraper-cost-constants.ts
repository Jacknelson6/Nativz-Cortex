/**
 * Client-safe constants split from scraper-settings.ts so client components
 * (e.g. components/settings/scraper-volumes-section.tsx) can import them
 * without pulling in the server-only Supabase client that lives in the
 * main settings module.
 */

/**
 * Per-unit cost estimates (USD) for the cost calculator UI. Measured from
 * real production runs on 2026-04-23 — revise when actor pricing changes.
 *
 * Reddit is per-post (comments bundle into the same dataset rows but the
 * ceiling is posts). Web is roughly free. TikTok/YouTube per video.
 */
export const PER_UNIT_COST_USD = {
  reddit: 0.021,
  youtube: 0.0005,
  tiktok: 0.0003,
  web: 0.0,
  quora: 0.0,
} as const;
