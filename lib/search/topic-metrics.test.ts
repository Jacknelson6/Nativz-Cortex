import { describe, expect, it } from 'vitest';
import {
  RESONANCE_LABEL,
  formatTopicReach,
  getTopicReachValue,
} from './topic-metrics';
import type { LegacyTrendingTopic, TrendingTopic } from '@/lib/types/search';

const EM_DASH = '—';

/**
 * topic-metrics is the tiny shim that lets the dashboard render reach
 * for both the new pipeline (TrendingTopic, with `total_engagement`)
 * and the legacy pipeline (LegacyTrendingTopic, with `estimated_views`).
 * Both topic shapes still live in production search rows, so the
 * preference rule and clamp-to-zero behaviour are load-bearing:
 *
 *   - `total_engagement` wins when present; legacy `estimated_views`
 *     is the fallback.
 *   - Negative or non-numeric values must clamp to 0 so the UI never
 *     renders "-3.40K" reach.
 *   - `formatTopicReach` returns the em-dash placeholder for zero or
 *     unknown reach so empty rows are visually distinct from "0".
 */

const newTopic = (total_engagement?: number): TrendingTopic =>
  ({
    name: 'x',
    resonance: 'medium',
    sentiment: 0,
    total_engagement,
    posts_overview: '',
    comments_overview: '',
    sources: [],
    video_ideas: [],
  }) as TrendingTopic;

const legacyTopic = (estimated_views: number): LegacyTrendingTopic =>
  ({
    name: 'x',
    estimated_views,
    resonance: 'medium',
    sentiment: 0,
    date: '2026-01-01',
    posts_overview: '',
    comments_overview: '',
    video_ideas: [],
  }) as LegacyTrendingTopic;

describe('RESONANCE_LABEL', () => {
  it('maps every resonance bucket to its display label', () => {
    expect(RESONANCE_LABEL).toEqual({
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      viral: 'Viral',
    });
  });
});

describe('getTopicReachValue — new pipeline (total_engagement)', () => {
  it('returns total_engagement when set as a number', () => {
    expect(getTopicReachValue(newTopic(12_345))).toBe(12_345);
  });

  it('returns 0 when total_engagement is exactly 0 (still a number, no fallback)', () => {
    expect(getTopicReachValue(newTopic(0))).toBe(0);
  });

  it('clamps negative total_engagement to 0', () => {
    expect(getTopicReachValue(newTopic(-50))).toBe(0);
  });

  it('falls back to 0 when total_engagement is missing entirely', () => {
    const t = newTopic(undefined);
    delete (t as Partial<TrendingTopic>).total_engagement;
    expect(getTopicReachValue(t)).toBe(0);
  });
});

describe('getTopicReachValue — legacy pipeline (estimated_views)', () => {
  it('returns estimated_views for a legacy topic', () => {
    expect(getTopicReachValue(legacyTopic(900))).toBe(900);
  });

  it('clamps negative estimated_views to 0', () => {
    expect(getTopicReachValue(legacyTopic(-1))).toBe(0);
  });

  it('returns 0 when estimated_views is 0', () => {
    expect(getTopicReachValue(legacyTopic(0))).toBe(0);
  });
});

describe('getTopicReachValue — preference order', () => {
  it('prefers total_engagement over estimated_views when both are present', () => {
    const hybrid = {
      ...newTopic(500),
      estimated_views: 999_999,
    } as unknown as TrendingTopic;
    expect(getTopicReachValue(hybrid)).toBe(500);
  });

  it('falls through to estimated_views when total_engagement is non-numeric', () => {
    // Defensive: legacy rows occasionally carry total_engagement: null.
    // Function checks `typeof === 'number'`, so null falls through.
    const hybrid = {
      ...newTopic(undefined),
      total_engagement: null,
      estimated_views: 750,
    } as unknown as TrendingTopic;
    expect(getTopicReachValue(hybrid)).toBe(750);
  });
});

describe('formatTopicReach', () => {
  it('returns the em-dash for zero reach', () => {
    expect(formatTopicReach(newTopic(0))).toBe(EM_DASH);
  });

  it('returns the em-dash for negative reach (clamp -> 0 -> dash)', () => {
    expect(formatTopicReach(newTopic(-100))).toBe(EM_DASH);
  });

  it('returns the em-dash when reach fields are missing', () => {
    const t = newTopic(undefined);
    delete (t as Partial<TrendingTopic>).total_engagement;
    expect(formatTopicReach(t)).toBe(EM_DASH);
  });

  it('formats positive engagement with compact-count two-decimal output', () => {
    // formatCompactCount: 211_820 -> "211.82K".
    expect(formatTopicReach(newTopic(211_820))).toBe('211.82K');
  });

  it('formats millions-scale engagement with M suffix', () => {
    expect(formatTopicReach(newTopic(2_500_000))).toBe('2.50M');
  });

  it('formats sub-thousand engagement with locale separators', () => {
    expect(formatTopicReach(newTopic(842))).toBe('842');
  });

  it('formats legacy estimated_views the same way as new total_engagement', () => {
    expect(formatTopicReach(legacyTopic(15_000))).toBe('15.00K');
  });
});
