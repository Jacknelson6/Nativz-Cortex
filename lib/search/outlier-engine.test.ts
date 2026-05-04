import { describe, expect, it } from 'vitest';
import { calculateOutlierScores, getTopOutliers } from './outlier-engine';
import type { ScrapedVideo, ScoredVideo } from '@/lib/scrapers/types';

/**
 * outlier-engine is the "is this video doing way more than this creator's
 * usual?" computation that drives the entire topic-search ranking. Three
 * contracts to pin:
 *
 *   1. The baseline is per-creator (`platform:author_username`), not
 *      global. A creator who averages 10K but posts a 500K view video
 *      should score ~50, not get washed out by some other creator's
 *      million-view baseline. Mixing creators here would make outliers
 *      track raw views and defeat the whole product.
 *
 *   2. Multi-video creators use MEDIAN views as the baseline (not mean).
 *      The mean gets pulled toward the very outliers we're trying to
 *      detect, so a creator with one viral video would have an inflated
 *      baseline and the next viral video would silently rank lower.
 *
 *   3. Single-video creators fall back to followers * 0.02 (a documented
 *      2% view rate for short-form), with a conservative 100-view floor
 *      when followers is 0. Removing the floor would divide-by-zero on
 *      brand-new accounts and produce Infinity scores.
 */

const makeVideo = (overrides: Partial<ScrapedVideo>): ScrapedVideo =>
  ({
    platform: 'tiktok',
    platform_id: 'pid',
    url: 'https://example.com/x',
    thumbnail_url: null,
    title: null,
    description: null,
    views: 100,
    likes: 0,
    comments: 0,
    shares: 0,
    bookmarks: 0,
    author_username: 'someone',
    author_display_name: null,
    author_avatar: null,
    author_followers: 0,
    hashtags: [],
    duration_seconds: null,
    publish_date: null,
    ...overrides,
  }) as ScrapedVideo;

describe('calculateOutlierScores — empty / minimal input', () => {
  it('returns [] for an empty array', () => {
    expect(calculateOutlierScores([])).toEqual([]);
  });

  it('initialises hook_text to null on every scored video', () => {
    const out = calculateOutlierScores([
      makeVideo({ author_followers: 1000, views: 100 }),
    ]);
    expect(out[0].hook_text).toBeNull();
  });
});

describe('calculateOutlierScores — single-video creator (follower fallback)', () => {
  it('uses followers * 0.02 as the baseline', () => {
    // 10_000 followers * 0.02 = 200 baseline; views 1000 -> 5.0
    const out = calculateOutlierScores([
      makeVideo({ author_followers: 10_000, views: 1000, author_username: 'a' }),
    ]);
    expect(out[0].outlier_score).toBe(5);
  });

  it('falls back to a 100-view floor when followers is 0 (no Infinity)', () => {
    const out = calculateOutlierScores([
      makeVideo({ author_followers: 0, views: 500, author_username: 'a' }),
    ]);
    // 500 / 100 = 5.0
    expect(out[0].outlier_score).toBe(5);
    expect(Number.isFinite(out[0].outlier_score)).toBe(true);
  });

  it('clamps a tiny follower-based baseline to >= 1 (no division blow-up)', () => {
    // 10 followers * 0.02 = 0.2; Math.max(0.2, 1) = 1; views 50 -> 50.
    // Without the floor, baseline would be 0.2 and score would be 250.
    const out = calculateOutlierScores([
      makeVideo({ author_followers: 10, views: 50, author_username: 'a' }),
    ]);
    expect(out[0].outlier_score).toBe(50);
  });

  it('rounds the score to 2 decimal places', () => {
    // baseline 200, views 333 -> 1.665 -> 1.67
    const out = calculateOutlierScores([
      makeVideo({ author_followers: 10_000, views: 333, author_username: 'a' }),
    ]);
    expect(out[0].outlier_score).toBe(1.67);
  });
});

describe('calculateOutlierScores — multi-video creator (median baseline)', () => {
  it('uses median views as the baseline for >= 2 videos', () => {
    // Even count median: (5 + 15) / 2 = 10
    // Views [1, 5, 15, 100] -> baseline 10 -> scores [0.1, 0.5, 1.5, 10.0]
    const out = calculateOutlierScores([
      makeVideo({ author_username: 'creator', views: 1, platform_id: 'a' }),
      makeVideo({ author_username: 'creator', views: 5, platform_id: 'b' }),
      makeVideo({ author_username: 'creator', views: 15, platform_id: 'c' }),
      makeVideo({ author_username: 'creator', views: 100, platform_id: 'd' }),
    ]);
    const byId = Object.fromEntries(out.map(v => [v.platform_id, v.outlier_score]));
    expect(byId.a).toBe(0.1);
    expect(byId.b).toBe(0.5);
    expect(byId.c).toBe(1.5);
    expect(byId.d).toBe(10);
  });

  it('uses the middle value for an odd-count creator', () => {
    // Views [10, 50, 100] -> median 50 -> 200/50 = 4
    const out = calculateOutlierScores([
      makeVideo({ author_username: 'c', views: 10, platform_id: 'a' }),
      makeVideo({ author_username: 'c', views: 50, platform_id: 'b' }),
      makeVideo({ author_username: 'c', views: 100, platform_id: 'c' }),
      makeVideo({ author_username: 'c', views: 200, platform_id: 'd' }),
    ]);
    // Wait — 4 videos = even. Use 3 videos to test odd path.
    const odd = calculateOutlierScores([
      makeVideo({ author_username: 'c', views: 10, platform_id: 'a' }),
      makeVideo({ author_username: 'c', views: 50, platform_id: 'b' }),
      makeVideo({ author_username: 'c', views: 200, platform_id: 'c' }),
    ]);
    expect(odd.find(v => v.platform_id === 'c')?.outlier_score).toBe(4);
    expect(out.length).toBe(4);
  });

  it('clamps median baseline to >= 1 (creator with all-0 views cannot Infinity)', () => {
    const out = calculateOutlierScores([
      makeVideo({ author_username: 'c', views: 0, platform_id: 'a' }),
      makeVideo({ author_username: 'c', views: 0, platform_id: 'b' }),
      makeVideo({ author_username: 'c', views: 50, platform_id: 'c' }),
    ]);
    const c = out.find(v => v.platform_id === 'c');
    expect(Number.isFinite(c?.outlier_score)).toBe(true);
    // median of [0,0,50] = 0 -> clamped to 1 -> score 50
    expect(c?.outlier_score).toBe(50);
  });
});

describe('calculateOutlierScores — creator scoping', () => {
  it('does NOT mix creators when computing the baseline', () => {
    // Creator A averages 10 views, posts a 1000-view banger.
    // Creator B has one video with 1000 views and 100k followers.
    // A's outlier should be ~100 (1000/10), not affected by B.
    const out = calculateOutlierScores([
      makeVideo({ author_username: 'A', views: 5, platform_id: 'a1' }),
      makeVideo({ author_username: 'A', views: 15, platform_id: 'a2' }),
      makeVideo({ author_username: 'A', views: 1000, platform_id: 'a3' }),
      makeVideo({
        author_username: 'B',
        views: 1000,
        platform_id: 'b1',
        author_followers: 100_000,
      }),
    ]);
    const byId = Object.fromEntries(out.map(v => [v.platform_id, v.outlier_score]));
    // A's median is 15 -> 1000/15 = 66.67
    expect(byId.a3).toBe(66.67);
    // B's baseline is 100_000 * 0.02 = 2000 -> 1000/2000 = 0.5
    expect(byId.b1).toBe(0.5);
  });

  it('treats the same username on different platforms as different creators', () => {
    const out = calculateOutlierScores([
      makeVideo({
        platform: 'tiktok',
        author_username: 'shared',
        views: 100,
        author_followers: 1000,
        platform_id: 'tt-1',
      }),
      makeVideo({
        platform: 'youtube',
        author_username: 'shared',
        views: 100,
        author_followers: 50_000,
        platform_id: 'yt-1',
      }),
    ]);
    // tiktok baseline = 1000 * 0.02 = 20 -> 100/20 = 5
    // youtube baseline = 50_000 * 0.02 = 1000 -> 100/1000 = 0.1
    const byId = Object.fromEntries(out.map(v => [v.platform_id, v.outlier_score]));
    expect(byId['tt-1']).toBe(5);
    expect(byId['yt-1']).toBe(0.1);
  });
});

describe('getTopOutliers — sort + slice', () => {
  const scored: ScoredVideo[] = [
    { ...makeVideo({ platform_id: 'a' }), outlier_score: 1, hook_text: null },
    { ...makeVideo({ platform_id: 'b' }), outlier_score: 50, hook_text: null },
    { ...makeVideo({ platform_id: 'c' }), outlier_score: 10, hook_text: null },
    { ...makeVideo({ platform_id: 'd' }), outlier_score: 100, hook_text: null },
  ];

  it('returns the top N sorted by outlier_score descending', () => {
    const out = getTopOutliers(scored, 2);
    expect(out.map(v => v.platform_id)).toEqual(['d', 'b']);
  });

  it('defaults to top 10 when n is omitted', () => {
    const out = getTopOutliers(scored);
    expect(out).toHaveLength(4);
    expect(out[0].platform_id).toBe('d');
  });

  it('does not mutate the input array', () => {
    const before = scored.map(v => v.platform_id);
    getTopOutliers(scored, 2);
    expect(scored.map(v => v.platform_id)).toEqual(before);
  });

  it('returns [] for an empty input regardless of n', () => {
    expect(getTopOutliers([], 5)).toEqual([]);
  });
});
