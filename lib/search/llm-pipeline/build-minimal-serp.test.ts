import { describe, expect, it } from 'vitest';
import { buildMinimalSerpFromHits, guessPlatformFromUrl } from './build-minimal-serp';
import type { WebSearchHit } from '@/lib/search/tools/web-search';

/**
 * build-minimal-serp packs the LLM pipeline's web hits back into the
 * SerpData shape that older `hasSerp()` consumers expect. Two contracts
 * to pin:
 *
 *   1. guessPlatformFromUrl is a substring match, NOT a hostname parse.
 *      `youtu.be` short links and `m.youtube.com` mobile links must
 *      both resolve to 'youtube' or downstream filtering breaks.
 *      Quora and other discussion sites intentionally fold into 'web'
 *      because we don't run a dedicated Quora pipeline — flipping that
 *      would silently lose hits.
 *
 *   2. buildMinimalSerpFromHits emits empty arrays for `discussions`
 *      and `videos`. The legacy `hasSerp()` check tolerates empty
 *      arrays but trips on missing keys; downstream rendering also
 *      assumes the keys exist before reading `.length`.
 */

describe('guessPlatformFromUrl', () => {
  it('returns "reddit" for any reddit.com URL', () => {
    expect(guessPlatformFromUrl('https://www.reddit.com/r/fitness/comments/x/y')).toBe('reddit');
    expect(guessPlatformFromUrl('https://old.reddit.com/r/x')).toBe('reddit');
  });

  it('returns "youtube" for youtube.com AND youtu.be (short link)', () => {
    expect(guessPlatformFromUrl('https://www.youtube.com/watch?v=abc')).toBe('youtube');
    expect(guessPlatformFromUrl('https://youtu.be/abc')).toBe('youtube');
    expect(guessPlatformFromUrl('https://m.youtube.com/shorts/abc')).toBe('youtube');
  });

  it('returns "tiktok" for tiktok.com URLs', () => {
    expect(guessPlatformFromUrl('https://www.tiktok.com/@user/video/123')).toBe('tiktok');
  });

  it('is case-insensitive (uppercase host still matches)', () => {
    expect(guessPlatformFromUrl('https://WWW.REDDIT.COM/r/x')).toBe('reddit');
  });

  it('falls back to "web" for any other URL', () => {
    expect(guessPlatformFromUrl('https://example.com/article')).toBe('web');
    expect(guessPlatformFromUrl('https://news.ycombinator.com/item?id=1')).toBe('web');
  });

  it('folds quora.com into "web" (no dedicated quora pipeline)', () => {
    expect(guessPlatformFromUrl('https://www.quora.com/What-is-X')).toBe('web');
  });
});

describe('buildMinimalSerpFromHits', () => {
  const hits: WebSearchHit[] = [
    { title: 'A', url: 'https://a.example/x', snippet: 'first' } as WebSearchHit,
    { title: 'B', url: 'https://b.example/y', snippet: 'second' } as WebSearchHit,
  ];

  it('maps each hit onto a SERP webResults entry (title/url/description)', () => {
    expect(buildMinimalSerpFromHits(hits).webResults).toEqual([
      { title: 'A', url: 'https://a.example/x', description: 'first' },
      { title: 'B', url: 'https://b.example/y', description: 'second' },
    ]);
  });

  it('emits empty arrays for discussions + videos (hasSerp consumers rely on the keys)', () => {
    const out = buildMinimalSerpFromHits(hits);
    expect(out.discussions).toEqual([]);
    expect(out.videos).toEqual([]);
  });

  it('returns webResults=[] for empty input (still a valid SerpData)', () => {
    const out = buildMinimalSerpFromHits([]);
    expect(out).toEqual({ webResults: [], discussions: [], videos: [] });
  });
});
