import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const maybeSingle = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle,
        }),
      }),
    }),
  }),
}));

import {
  DEFAULT_UNIT_PRICES,
  SCRAPER_DEFAULTS,
  estimateSearchCost,
  getScraperSettings,
  getUnitPrices,
  invalidateScraperSettingsCache,
  invalidateUnitPricesCache,
  type ScraperSettings,
} from './scraper-settings';
import { PER_UNIT_COST_USD } from './scraper-cost-constants';

/**
 * scraper-settings is the single source of truth for per-platform scrape
 * counts and unit prices. Three contracts to pin:
 *
 *   1. Both readers (`getScraperSettings`, `getUnitPrices`) silently fall
 *      back to defaults on ANY failure — missing row, DB error, or thrown
 *      exception. The 2026-04-23 incident review made this explicit: a
 *      search must never wedge because the settings table is empty.
 *
 *   2. The 30s / 60s in-memory caches are TTL'd, but `invalidate*Cache()`
 *      forces a re-read. The admin settings form depends on this so the
 *      next search picks up freshly-saved volumes / prices without waiting
 *      out the TTL.
 *
 *   3. `estimateSearchCost` only multiplies the *primary* volume per
 *      platform (reddit posts, youtube videos, tiktok videos, web results).
 *      Comment / transcript counts are intentionally excluded from the
 *      projection — they're zero-cost fan-out from the primary scrape.
 *      A regression that includes them would over-project and spuriously
 *      trip the budget-guard gate.
 */

beforeEach(() => {
  invalidateScraperSettingsCache();
  invalidateUnitPricesCache();
  maybeSingle.mockReset();
});

describe('SCRAPER_DEFAULTS / DEFAULT_UNIT_PRICES — exposed shape', () => {
  it('SCRAPER_DEFAULTS matches the documented "medium tier" baseline', () => {
    expect(SCRAPER_DEFAULTS).toEqual({
      reddit: { posts: 100, commentPosts: 15 },
      youtube: { videos: 100, commentVideos: 30, transcriptVideos: 20 },
      tiktok: { videos: 200, commentVideos: 30, transcriptVideos: 50 },
      web: { results: 30 },
    });
  });

  it('DEFAULT_UNIT_PRICES mirrors PER_UNIT_COST_USD with refreshedAt=null', () => {
    expect(DEFAULT_UNIT_PRICES).toEqual({
      reddit: PER_UNIT_COST_USD.reddit,
      youtube: PER_UNIT_COST_USD.youtube,
      tiktok: PER_UNIT_COST_USD.tiktok,
      web: PER_UNIT_COST_USD.web,
      refreshedAt: null,
    });
  });
});

describe('getScraperSettings — fallback paths', () => {
  it('returns SCRAPER_DEFAULTS when the row is missing (data null, no error)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const out = await getScraperSettings();
    expect(out).toEqual(SCRAPER_DEFAULTS);
  });

  it('returns SCRAPER_DEFAULTS when supabase returns an error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const out = await getScraperSettings();
    expect(out).toEqual(SCRAPER_DEFAULTS);
  });

  it('returns SCRAPER_DEFAULTS when the query throws', async () => {
    maybeSingle.mockRejectedValue(new Error('connection refused'));
    const out = await getScraperSettings();
    expect(out).toEqual(SCRAPER_DEFAULTS);
  });
});

describe('getScraperSettings — happy path mapping', () => {
  it('maps DB columns onto the nested ScraperSettings shape', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        reddit_posts: 250,
        reddit_comments_per_post: 10,
        youtube_videos: 50,
        youtube_comment_videos: 5,
        youtube_transcript_videos: 3,
        tiktok_videos: 400,
        tiktok_comment_videos: 12,
        tiktok_transcript_videos: 8,
        web_results: 15,
      },
      error: null,
    });
    const out = await getScraperSettings();
    expect(out).toEqual({
      reddit: { posts: 250, commentPosts: 10 },
      youtube: { videos: 50, commentVideos: 5, transcriptVideos: 3 },
      tiktok: { videos: 400, commentVideos: 12, transcriptVideos: 8 },
      web: { results: 15 },
    });
  });

  it('per-field-coerces null/undefined columns back to defaults (partial row)', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        reddit_posts: 250,
        reddit_comments_per_post: null,
        youtube_videos: undefined,
      },
      error: null,
    });
    const out = await getScraperSettings();
    expect(out.reddit.posts).toBe(250);
    expect(out.reddit.commentPosts).toBe(SCRAPER_DEFAULTS.reddit.commentPosts);
    expect(out.youtube.videos).toBe(SCRAPER_DEFAULTS.youtube.videos);
    expect(out.tiktok.videos).toBe(SCRAPER_DEFAULTS.tiktok.videos);
    expect(out.web.results).toBe(SCRAPER_DEFAULTS.web.results);
  });

  it('coerces string values from the row through Number()', async () => {
    maybeSingle.mockResolvedValue({
      data: { reddit_posts: '777' },
      error: null,
    });
    const out = await getScraperSettings();
    expect(out.reddit.posts).toBe(777);
  });
});

describe('getScraperSettings — caching', () => {
  it('only hits the DB once within the TTL window', async () => {
    maybeSingle.mockResolvedValue({
      data: { reddit_posts: 999 },
      error: null,
    });
    await getScraperSettings();
    await getScraperSettings();
    await getScraperSettings();
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('invalidateScraperSettingsCache forces a re-read on the next call', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { reddit_posts: 100 }, error: null });
    const first = await getScraperSettings();
    expect(first.reddit.posts).toBe(100);

    invalidateScraperSettingsCache();
    maybeSingle.mockResolvedValueOnce({ data: { reddit_posts: 555 }, error: null });
    const second = await getScraperSettings();
    expect(second.reddit.posts).toBe(555);
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });
});

describe('getUnitPrices — fallback + mapping', () => {
  it('returns DEFAULT_UNIT_PRICES when the row is missing', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const out = await getUnitPrices();
    expect(out).toEqual(DEFAULT_UNIT_PRICES);
  });

  it('returns DEFAULT_UNIT_PRICES when the query throws', async () => {
    maybeSingle.mockRejectedValue(new Error('boom'));
    const out = await getUnitPrices();
    expect(out).toEqual(DEFAULT_UNIT_PRICES);
  });

  it('maps the refreshed-pricing row including refreshedAt', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        reddit_price_per_unit: 0.001,
        youtube_price_per_unit: 0.002,
        tiktok_price_per_unit: 0.0004,
        web_price_per_unit: 0,
        refreshed_at: '2026-04-23T00:00:00Z',
      },
      error: null,
    });
    const out = await getUnitPrices();
    expect(out).toEqual({
      reddit: 0.001,
      youtube: 0.002,
      tiktok: 0.0004,
      web: 0,
      refreshedAt: '2026-04-23T00:00:00Z',
    });
  });

  it('caches across calls and invalidateUnitPricesCache forces a re-read', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { reddit_price_per_unit: 0.01, refreshed_at: null },
      error: null,
    });
    const first = await getUnitPrices();
    await getUnitPrices();
    expect(first.reddit).toBe(0.01);
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    invalidateUnitPricesCache();
    maybeSingle.mockResolvedValueOnce({
      data: { reddit_price_per_unit: 0.02, refreshed_at: null },
      error: null,
    });
    const second = await getUnitPrices();
    expect(second.reddit).toBe(0.02);
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });
});

describe('estimateSearchCost — pure pricing math', () => {
  const settings: ScraperSettings = {
    reddit: { posts: 100, commentPosts: 999 },
    youtube: { videos: 50, commentVideos: 999, transcriptVideos: 999 },
    tiktok: { videos: 200, commentVideos: 999, transcriptVideos: 999 },
    web: { results: 30 },
  };

  it('multiplies primary volumes by DEFAULT_UNIT_PRICES when prices arg omitted', () => {
    const out = estimateSearchCost(settings);
    expect(out.perPlatformUsd).toEqual({
      reddit: 100 * PER_UNIT_COST_USD.reddit,
      youtube: 50 * PER_UNIT_COST_USD.youtube,
      tiktok: 200 * PER_UNIT_COST_USD.tiktok,
      web: 30 * PER_UNIT_COST_USD.web,
    });
    expect(out.totalUsd).toBeCloseTo(
      out.perPlatformUsd.reddit +
        out.perPlatformUsd.youtube +
        out.perPlatformUsd.tiktok +
        out.perPlatformUsd.web,
      10,
    );
  });

  it('honours an explicit live-prices arg', () => {
    const out = estimateSearchCost(settings, {
      reddit: 0.01,
      youtube: 0.02,
      tiktok: 0,
      web: 0.05,
      refreshedAt: null,
    });
    expect(out.perPlatformUsd).toEqual({
      reddit: 100 * 0.01,
      youtube: 50 * 0.02,
      tiktok: 0,
      web: 30 * 0.05,
    });
  });

  it('IGNORES comment / transcript volumes (only primary counts contribute)', () => {
    // Bumping the secondary volumes from 999 to 9_999_999 must not change cost.
    const inflated: ScraperSettings = {
      ...settings,
      reddit: { ...settings.reddit, commentPosts: 9_999_999 },
      youtube: {
        ...settings.youtube,
        commentVideos: 9_999_999,
        transcriptVideos: 9_999_999,
      },
      tiktok: {
        ...settings.tiktok,
        commentVideos: 9_999_999,
        transcriptVideos: 9_999_999,
      },
    };
    expect(estimateSearchCost(inflated).totalUsd).toBeCloseTo(
      estimateSearchCost(settings).totalUsd,
      10,
    );
  });

  it('returns totalUsd=0 when every primary volume is 0', () => {
    const zero: ScraperSettings = {
      reddit: { posts: 0, commentPosts: 0 },
      youtube: { videos: 0, commentVideos: 0, transcriptVideos: 0 },
      tiktok: { videos: 0, commentVideos: 0, transcriptVideos: 0 },
      web: { results: 0 },
    };
    expect(estimateSearchCost(zero)).toEqual({
      perPlatformUsd: { reddit: 0, youtube: 0, tiktok: 0, web: 0 },
      totalUsd: 0,
    });
  });
});
