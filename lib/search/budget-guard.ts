/**
 * Per-search Apify budget guard.
 *
 * Before a topic search fans out to its platform scrapers, project the
 * worst-case Apify cost from the current `scraper_settings` row. If it
 * would exceed `SEARCH_BUDGET_USD`, return a warning so the caller can
 * either skip the most expensive platform or reject the search entirely.
 *
 * This is the safety net that should have been in place on 2026-04-23
 * when a single `volume=deep` search ballooned to ~$4.86 in Reddit alone
 * because the override guard treated `reddit_posts=0` as "use default".
 * See lib/reddit/apify-trudax.ts targetPosts() for that fix; this module
 * is belt-and-braces on top.
 */

import { estimateSearchCost, type ScraperSettings } from '@/lib/search/scraper-settings';

/** Hard cap. Raise via env ONLY if you know the downstream pipelines changed. */
export const SEARCH_BUDGET_USD = (() => {
  const env = process.env.CORTEX_SEARCH_BUDGET_USD;
  const n = env ? parseFloat(env) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 2.0;
})();

export interface BudgetCheckResult {
  /** true = safe to run */
  ok: boolean;
  /** estimated dollar spend across every platform */
  projectedUsd: number;
  /** per-platform breakdown (for explainability in admin UI) */
  perPlatformUsd: Record<keyof ScraperSettings, number>;
  /** when ok=false, which platforms should be dropped to get under budget */
  dropSuggestions?: Array<keyof ScraperSettings>;
  /** human-readable reason */
  reason?: string;
}

export function checkSearchBudget(settings: ScraperSettings): BudgetCheckResult {
  const { totalUsd, perPlatformUsd } = estimateSearchCost(settings);

  if (totalUsd <= SEARCH_BUDGET_USD) {
    return { ok: true, projectedUsd: totalUsd, perPlatformUsd };
  }

  // Suggest which platforms to drop — biggest first — until we're under.
  const byCost = (Object.entries(perPlatformUsd) as Array<[keyof ScraperSettings, number]>)
    .sort((a, b) => b[1] - a[1]);
  const dropSuggestions: Array<keyof ScraperSettings> = [];
  let remaining = totalUsd;
  for (const [platform, cost] of byCost) {
    if (remaining <= SEARCH_BUDGET_USD) break;
    dropSuggestions.push(platform);
    remaining -= cost;
  }

  return {
    ok: false,
    projectedUsd: totalUsd,
    perPlatformUsd,
    dropSuggestions,
    reason: `Projected cost $${totalUsd.toFixed(2)} exceeds per-search budget $${SEARCH_BUDGET_USD.toFixed(2)}. Drop ${dropSuggestions.join(', ')} or lower volumes in /admin/settings/ai.`,
  };
}
