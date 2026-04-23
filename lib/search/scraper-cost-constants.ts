/**
 * Client-safe constants split from scraper-settings.ts so client components
 * (e.g. components/settings/scraper-volumes-section.tsx) can import them
 * without pulling in the server-only Supabase client that lives in the
 * main settings module.
 */

/**
 * Per-unit cost estimates (USD) for the cost calculator UI + per-search
 * budget guard. Measured from real production runs on 2026-04-23 — revise
 * when actor pricing changes.
 *
 * Reddit is per-post. Default path is macrocosmos/reddit-scraper at
 * ~$0.0005/item (see `lib/reddit/apify-macrocosmos.ts`). The trudax fallback
 * costs ~$0.021/item but is hard-capped at 200 items/run in
 * `apify-trudax.ts::HARD_MAX_POSTS_PER_RUN`, so worst-case fallback spend
 * is ~$0.80/run even if this projection under-estimates it — still fits
 * under the $2 per-search budget gate. If you pin the trudax provider via
 * `APIFY_REDDIT_PROVIDER=trudax`, bump `reddit` here to 0.021 so the gate
 * projects honestly.
 *
 * Web is roughly free (SERP is a single scraperlink call). TikTok/YouTube
 * per video.
 */
export const PER_UNIT_COST_USD = {
  reddit: 0.0005,
  youtube: 0.0005,
  tiktok: 0.0003,
  web: 0.0,
} as const;
