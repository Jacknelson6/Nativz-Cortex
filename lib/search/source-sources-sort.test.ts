import { describe, expect, it } from 'vitest';
import {
  sortSources,
  sourceBrandSimilarityScore,
  type SourceSortContext,
} from './source-sources-sort';
import type { PlatformSource } from '@/lib/types/search';

/**
 * source-sources-sort drives the source-list sort modes in the topic
 * search detail view. Two contracts to pin:
 *
 *   1. The 'similar' score is a deterministic lexical overlap, not a
 *      semantic distance. A regression that changes which words feed
 *      the term set (e.g. drops `industry` or includes <=2 char stop
 *      words) silently re-orders the entire panel.
 *
 *   2. Every sort mode must be stable and non-mutating. The view
 *      relies on `id` as a deterministic last-resort tiebreaker so
 *      pagination and de-dup logic don't shuffle on re-renders.
 */

const makeSource = (
  id: string,
  overrides: Partial<PlatformSource> = {},
): PlatformSource =>
  ({
    platform: 'youtube',
    id,
    url: `https://example.com/${id}`,
    title: '',
    content: '',
    author: 'someone',
    engagement: {},
    createdAt: '2026-01-01T00:00:00Z',
    comments: [],
    ...overrides,
  }) as PlatformSource;

describe('sourceBrandSimilarityScore', () => {
  const baseCtx: SourceSortContext = {
    searchQuery: 'protein shakes',
    industry: 'fitness',
    clientName: 'Apex',
    topicKeywords: ['recovery', 'workout'],
  };

  it('counts each distinct ctx term that appears in title+content', () => {
    const source = makeSource('a', {
      title: 'protein shakes for fitness',
      content: 'apex recovery routine',
    });
    // protein, shakes, fitness, apex, recovery -> 5
    // plus full-query "protein shakes" bonus (+3) -> 8
    expect(sourceBrandSimilarityScore(source, baseCtx)).toBe(8);
  });

  it('does NOT credit the same term twice when context overlaps', () => {
    // industry term equals searchQuery word -> still one credit.
    const ctx: SourceSortContext = {
      searchQuery: 'fitness',
      industry: 'fitness',
    };
    const source = makeSource('a', { title: 'fitness fitness fitness', content: '' });
    // searchQuery is "fitness" (>3 chars) and is in text -> +3 query bonus.
    // term set = {"fitness"} -> +1 word match.
    expect(sourceBrandSimilarityScore(source, ctx)).toBe(4);
  });

  it('skips words 2 chars or shorter (avoids inflating on stop words)', () => {
    const ctx: SourceSortContext = {
      searchQuery: 'to be',
      topicKeywords: ['it', 'is'],
    };
    const source = makeSource('a', {
      title: 'unrelated content here without the phrase',
      content: '',
    });
    // All ctx words are <= 2 chars -> term set is empty.
    // searchQuery "to be" is > 3 chars but NOT a substring of the title -> no bonus.
    expect(sourceBrandSimilarityScore(source, ctx)).toBe(0);
  });

  it('is case-insensitive in both directions', () => {
    const ctx: SourceSortContext = { searchQuery: 'PROTEIN' };
    const source = makeSource('a', { title: 'Protein power', content: '' });
    // searchQuery "PROTEIN" lowercased -> "protein"; text lowercased.
    // term match (+1) + full-query bonus (+3) = 4.
    expect(sourceBrandSimilarityScore(source, ctx)).toBe(4);
  });

  it('does NOT add the full-query bonus when query is 3 chars or shorter', () => {
    // "ok" is length 2 -> dropped from the term set entirely AND below
    // the q.length > 3 query-bonus threshold. The clean way to assert
    // that the bonus is gated on length without the term-set match
    // muddying the result.
    const ctx: SourceSortContext = { searchQuery: 'ok' };
    const source = makeSource('a', { title: 'ok then', content: '' });
    expect(sourceBrandSimilarityScore(source, ctx)).toBe(0);
  });

  it('handles missing optional context fields without throwing', () => {
    const source = makeSource('a', { title: 'protein', content: '' });
    expect(() =>
      sourceBrandSimilarityScore(source, { searchQuery: 'protein' }),
    ).not.toThrow();
  });

  it('skips non-string entries in topicKeywords (defensive)', () => {
    const ctx = {
      searchQuery: 'protein',
      topicKeywords: ['recovery', null, undefined, 42] as unknown as string[],
    } satisfies SourceSortContext;
    const source = makeSource('a', { title: 'protein recovery shake', content: '' });
    // protein (1) + recovery (1) + full-query bonus skipped ("protein" is exactly 7 chars > 3, IS in text -> +3)
    expect(sourceBrandSimilarityScore(source, ctx)).toBe(5);
  });

  it('returns 0 when nothing in ctx overlaps the source text', () => {
    const ctx: SourceSortContext = { searchQuery: 'spaceships' };
    const source = makeSource('a', { title: 'gardening tips', content: 'plant tomatoes' });
    expect(sourceBrandSimilarityScore(source, ctx)).toBe(0);
  });
});

describe('sortSources — recent', () => {
  const ctx: SourceSortContext = { searchQuery: 'x' };

  it('sorts newest createdAt first', () => {
    const a = makeSource('a', { createdAt: '2026-01-01T00:00:00Z' });
    const b = makeSource('b', { createdAt: '2026-03-01T00:00:00Z' });
    const c = makeSource('c', { createdAt: '2026-02-01T00:00:00Z' });
    expect(sortSources([a, b, c], 'recent', ctx).map((s) => s.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('breaks createdAt ties by id ascending (deterministic)', () => {
    const same = '2026-01-01T00:00:00Z';
    const z = makeSource('z', { createdAt: same });
    const a = makeSource('a', { createdAt: same });
    const m = makeSource('m', { createdAt: same });
    expect(sortSources([z, a, m], 'recent', ctx).map((s) => s.id)).toEqual([
      'a',
      'm',
      'z',
    ]);
  });

  it('treats unparseable createdAt as 0 (never throws)', () => {
    const a = makeSource('a', { createdAt: 'not-a-date' });
    const b = makeSource('b', { createdAt: '2026-01-01T00:00:00Z' });
    expect(sortSources([a, b], 'recent', ctx).map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('sortSources — views', () => {
  const ctx: SourceSortContext = { searchQuery: 'x' };

  it('sorts highest views first', () => {
    const a = makeSource('a', { engagement: { views: 100 } });
    const b = makeSource('b', { engagement: { views: 5_000 } });
    const c = makeSource('c', { engagement: { views: 750 } });
    expect(sortSources([a, b, c], 'views', ctx).map((s) => s.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('treats missing views as 0', () => {
    const a = makeSource('a', { engagement: { views: 10 } });
    const b = makeSource('b', { engagement: {} });
    expect(sortSources([a, b], 'views', ctx).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('breaks view ties by createdAt then by id', () => {
    const a = makeSource('a', {
      engagement: { views: 100 },
      createdAt: '2026-01-01T00:00:00Z',
    });
    const b = makeSource('b', {
      engagement: { views: 100 },
      createdAt: '2026-02-01T00:00:00Z',
    });
    const c = makeSource('c', {
      engagement: { views: 100 },
      createdAt: '2026-02-01T00:00:00Z',
    });
    // b and c tied at Feb -> id asc ("b" before "c"); a is older.
    expect(sortSources([a, b, c], 'views', ctx).map((s) => s.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });
});

describe('sortSources — similar', () => {
  const ctx: SourceSortContext = {
    searchQuery: 'protein shakes',
    industry: 'fitness',
    topicKeywords: ['recovery'],
  };

  it('sorts by descending brand-similarity score', () => {
    const high = makeSource('high', {
      title: 'protein shakes for fitness recovery',
      content: '',
    });
    const mid = makeSource('mid', { title: 'protein bars', content: '' });
    const low = makeSource('low', { title: 'random unrelated topic', content: '' });
    expect(sortSources([low, mid, high], 'similar', ctx).map((s) => s.id)).toEqual([
      'high',
      'mid',
      'low',
    ]);
  });

  it('breaks similarity ties by views then by id', () => {
    const a = makeSource('a', {
      title: 'protein shakes for fitness',
      engagement: { views: 100 },
    });
    const b = makeSource('b', {
      title: 'protein shakes for fitness',
      engagement: { views: 500 },
    });
    const c = makeSource('c', {
      title: 'protein shakes for fitness',
      engagement: { views: 500 },
    });
    // a, b, c have equal similarity. b and c tie on views -> id asc.
    expect(sortSources([a, b, c], 'similar', ctx).map((s) => s.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });
});

describe('sortSources — invariants', () => {
  const ctx: SourceSortContext = { searchQuery: 'x' };

  it('does not mutate the input list', () => {
    const a = makeSource('a', { createdAt: '2026-01-01T00:00:00Z' });
    const b = makeSource('b', { createdAt: '2026-03-01T00:00:00Z' });
    const input = [a, b];
    sortSources(input, 'recent', ctx);
    expect(input.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('returns an empty array unchanged for any mode', () => {
    expect(sortSources([], 'recent', ctx)).toEqual([]);
    expect(sortSources([], 'views', ctx)).toEqual([]);
    expect(sortSources([], 'similar', ctx)).toEqual([]);
  });
});
