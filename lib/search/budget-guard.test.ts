import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client should not be used in budget-guard tests');
  },
}));

import { checkSearchBudget, SEARCH_BUDGET_USD } from './budget-guard';
import { DEFAULT_UNIT_PRICES, type ScraperSettings } from './scraper-settings';

/**
 * budget-guard is the belt-and-braces $2/search cap that should have
 * caught the 2026-04-23 Reddit overrun. Three contracts to pin:
 *
 *   1. The cap reads from CORTEX_SEARCH_BUDGET_USD at module import.
 *      It defaults to 2.0 and rejects non-finite or non-positive
 *      env values rather than letting a typo silently disable the
 *      gate. Because the env is read at import-time, raising it
 *      requires a process restart, not just a test override.
 *
 *   2. dropSuggestions are sorted biggest-cost-first. The point of
 *      the suggestion is "drop the smallest set of platforms to fit
 *      under budget"; reversing this would suggest dropping the
 *      cheapest platform first, which would land the caller still
 *      over budget after the drop.
 *
 *   3. ok=true returns NO drop suggestions or reason string. Empty
 *      object equality is the assertion the admin UI relies on to
 *      decide whether to surface the warning banner.
 */

const baseSettings: ScraperSettings = {
  reddit: { posts: 100, commentPosts: 15 },
  youtube: { videos: 100, commentVideos: 30, transcriptVideos: 20 },
  tiktok: { videos: 200, commentVideos: 30, transcriptVideos: 50 },
  web: { results: 30 },
};

describe('SEARCH_BUDGET_USD', () => {
  it('exposes the 2.0 default for downstream callers (not just internal use)', () => {
    expect(SEARCH_BUDGET_USD).toBe(2.0);
  });
});

describe('checkSearchBudget — under-budget path', () => {
  it('returns ok=true with no dropSuggestions or reason when projection fits', () => {
    const out = checkSearchBudget(baseSettings);
    expect(out.ok).toBe(true);
    expect(out.dropSuggestions).toBeUndefined();
    expect(out.reason).toBeUndefined();
  });

  it('returns the per-platform breakdown computed from default unit prices', () => {
    const out = checkSearchBudget(baseSettings);
    expect(out.perPlatformUsd).toEqual({
      reddit: baseSettings.reddit.posts * DEFAULT_UNIT_PRICES.reddit,
      youtube: baseSettings.youtube.videos * DEFAULT_UNIT_PRICES.youtube,
      tiktok: baseSettings.tiktok.videos * DEFAULT_UNIT_PRICES.tiktok,
      web: baseSettings.web.results * DEFAULT_UNIT_PRICES.web,
    });
    expect(out.projectedUsd).toBeCloseTo(
      out.perPlatformUsd.reddit +
        out.perPlatformUsd.youtube +
        out.perPlatformUsd.tiktok +
        out.perPlatformUsd.web,
      10,
    );
  });

  it('treats the boundary (totalUsd === SEARCH_BUDGET_USD) as ok=true (inclusive)', () => {
    // Construct a settings object whose default-priced cost equals exactly $2.
    // reddit price 0.0005 USD per post -> 4000 posts == $2.00.
    const tight: ScraperSettings = {
      reddit: { posts: 4000, commentPosts: 0 },
      youtube: { videos: 0, commentVideos: 0, transcriptVideos: 0 },
      tiktok: { videos: 0, commentVideos: 0, transcriptVideos: 0 },
      web: { results: 0 },
    };
    const out = checkSearchBudget(tight);
    expect(out.projectedUsd).toBeCloseTo(2.0, 10);
    expect(out.ok).toBe(true);
  });
});

describe('checkSearchBudget — over-budget path', () => {
  const overSettings: ScraperSettings = {
    reddit: { posts: 10_000, commentPosts: 0 }, // $5 at default price
    youtube: { videos: 100, commentVideos: 0, transcriptVideos: 0 }, // $0.05
    tiktok: { videos: 200, commentVideos: 0, transcriptVideos: 0 }, // $0.06
    web: { results: 30 }, // $0
  };

  it('returns ok=false when the projected cost exceeds SEARCH_BUDGET_USD', () => {
    const out = checkSearchBudget(overSettings);
    expect(out.ok).toBe(false);
    expect(out.projectedUsd).toBeGreaterThan(SEARCH_BUDGET_USD);
  });

  it('suggests dropping the most expensive platform first', () => {
    const out = checkSearchBudget(overSettings);
    expect(out.dropSuggestions).toBeDefined();
    expect(out.dropSuggestions?.[0]).toBe('reddit');
  });

  it('stops adding drop suggestions once the running total fits under budget', () => {
    // Reddit alone is $5; dropping it leaves ~$0.11 -> well under $2.
    const out = checkSearchBudget(overSettings);
    expect(out.dropSuggestions).toEqual(['reddit']);
  });

  it('chains drops biggest-first when one drop is not enough', () => {
    // Both reddit and youtube each blow the budget on their own.
    const big: ScraperSettings = {
      reddit: { posts: 6_000, commentPosts: 0 }, // $3
      youtube: { videos: 6_000, commentVideos: 0, transcriptVideos: 0 }, // $3
      tiktok: { videos: 0, commentVideos: 0, transcriptVideos: 0 },
      web: { results: 0 },
    };
    const out = checkSearchBudget(big);
    expect(out.ok).toBe(false);
    // reddit and youtube tie at $3 each; sort is stable on ties so the
    // first-listed wins, but the contract is "drop biggest first" — both
    // must appear since dropping either one alone still leaves $3 > $2.
    expect(out.dropSuggestions).toHaveLength(2);
    expect(out.dropSuggestions).toContain('reddit');
    expect(out.dropSuggestions).toContain('youtube');
  });

  it('includes a human-readable reason naming the dollar amounts and dropped platforms', () => {
    const out = checkSearchBudget(overSettings);
    expect(out.reason).toContain('$');
    expect(out.reason).toContain('reddit');
    expect(out.reason).toContain('exceeds per-search budget');
  });

  it('uses 2 decimal places in the reason string (not raw float spew)', () => {
    const out = checkSearchBudget(overSettings);
    expect(out.reason).toMatch(/\$\d+\.\d{2}/);
  });
});

describe('checkSearchBudget — degenerate inputs', () => {
  it('returns ok=true and projected=0 when every platform volume is 0', () => {
    const zero: ScraperSettings = {
      reddit: { posts: 0, commentPosts: 0 },
      youtube: { videos: 0, commentVideos: 0, transcriptVideos: 0 },
      tiktok: { videos: 0, commentVideos: 0, transcriptVideos: 0 },
      web: { results: 0 },
    };
    const out = checkSearchBudget(zero);
    expect(out.ok).toBe(true);
    expect(out.projectedUsd).toBe(0);
    expect(out.perPlatformUsd).toEqual({ reddit: 0, youtube: 0, tiktok: 0, web: 0 });
  });
});
