import { describe, expect, it } from 'vitest';
import {
  EMOTION_COLORS,
  FORMAT_LABELS,
  IDEA_STATUS_LABELS,
  PRIORITY_COLORS,
  VIRALITY_COLORS,
  getSentimentBadgeVariant,
  getSentimentColorClass,
  getSentimentEmoji,
  getSentimentLabel,
} from './sentiment';

/**
 * sentiment.ts owns the colour + emoji + label mappings used in the
 * topic search detail and idea cards. The thresholds are slightly
 * inconsistent on purpose:
 *
 *   - getSentimentColorClass uses STRICT >: > 0.3 = green, > -0.3 = amber.
 *     A raw 0.3 is amber, not green. Easy to flip on a refactor.
 *   - getSentimentBadgeVariant uses INCLUSIVE >=: >= 0.2 = success.
 *     This is the same threshold as the surrounding badge logic in
 *     source-mention-utils.sentimentWord, intentionally.
 *
 * Misaligning these breaks the visual rule that a single source can
 * end up "green text + amber badge" or vice versa.
 */

describe('getSentimentColorClass — strict > thresholds', () => {
  it('returns emerald only for scores STRICTLY greater than 0.3', () => {
    expect(getSentimentColorClass(0.31)).toBe('text-emerald-600');
    expect(getSentimentColorClass(0.3)).toBe('text-amber-600');
  });

  it('returns amber for the neutral middle band', () => {
    expect(getSentimentColorClass(0)).toBe('text-amber-600');
    expect(getSentimentColorClass(-0.29)).toBe('text-amber-600');
  });

  it('returns red at or below -0.3', () => {
    expect(getSentimentColorClass(-0.3)).toBe('text-red-600');
    expect(getSentimentColorClass(-1)).toBe('text-red-600');
  });
});

describe('getSentimentBadgeVariant — inclusive >= thresholds', () => {
  it('returns success at or above +0.2', () => {
    expect(getSentimentBadgeVariant(0.2)).toBe('success');
    expect(getSentimentBadgeVariant(1)).toBe('success');
  });

  it('returns warning between -0.2 and +0.2 inclusive', () => {
    expect(getSentimentBadgeVariant(0.19)).toBe('warning');
    expect(getSentimentBadgeVariant(-0.2)).toBe('warning');
    expect(getSentimentBadgeVariant(0)).toBe('warning');
  });

  it('returns danger strictly below -0.2', () => {
    expect(getSentimentBadgeVariant(-0.21)).toBe('danger');
    expect(getSentimentBadgeVariant(-1)).toBe('danger');
  });
});

describe('getSentimentLabel — percentage rendering', () => {
  it('renders positive scores as "<n>% positive"', () => {
    // (0.6 + 1) / 2 = 0.8 -> 80
    expect(getSentimentLabel(0.6)).toBe('80% positive');
  });

  it('renders negative scores as "<n>% negative" using (100 - pct)', () => {
    // (-0.6 + 1) / 2 = 0.2 -> 20; 100 - 20 = 80% negative
    expect(getSentimentLabel(-0.6)).toBe('80% negative');
  });

  it('renders the neutral band as the bare "Neutral" label', () => {
    expect(getSentimentLabel(0)).toBe('Neutral');
    expect(getSentimentLabel(0.19)).toBe('Neutral');
    expect(getSentimentLabel(-0.19)).toBe('Neutral');
  });

  it('uses inclusive +/-0.2 thresholds for the positive/negative branches', () => {
    expect(getSentimentLabel(0.2)).toBe('60% positive');
    expect(getSentimentLabel(-0.2)).toBe('60% negative');
  });

  it('rounds the percentage to the nearest integer', () => {
    // (0.55 + 1) / 2 = 0.775 -> Math.round -> 78
    expect(getSentimentLabel(0.55)).toBe('78% positive');
  });
});

describe('getSentimentEmoji — five-bucket ramp', () => {
  it('uses the inclusive >= thresholds 0.6 / 0.2 / -0.2 / -0.6', () => {
    expect(getSentimentEmoji(0.6)).toBe('😊');
    expect(getSentimentEmoji(0.59)).toBe('🙂');
    expect(getSentimentEmoji(0.2)).toBe('🙂');
    expect(getSentimentEmoji(0.19)).toBe('😐');
    expect(getSentimentEmoji(-0.2)).toBe('😐');
    expect(getSentimentEmoji(-0.21)).toBe('😟');
    expect(getSentimentEmoji(-0.6)).toBe('😟');
    expect(getSentimentEmoji(-0.61)).toBe('😠');
  });

  it('clamps either extreme to the corresponding emoji', () => {
    expect(getSentimentEmoji(1)).toBe('😊');
    expect(getSentimentEmoji(-1)).toBe('😠');
  });
});

describe('Lookup tables — shape + completeness', () => {
  it('EMOTION_COLORS covers the documented emotion vocabulary', () => {
    for (const key of [
      'excitement',
      'frustration',
      'curiosity',
      'fomo',
      'skepticism',
      'trust',
      'anger',
      'joy',
      'surprise',
      'sadness',
    ]) {
      expect(EMOTION_COLORS[key]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('FORMAT_LABELS has display labels for every format slug we surface', () => {
    for (const key of [
      'talking_head',
      'broll_montage',
      'ugc_style',
      'duet_response',
      'green_screen',
      'street_interview',
      'day_in_the_life',
      'before_after',
      'tutorial',
      'myth_bust',
    ]) {
      expect(FORMAT_LABELS[key]).toBeTruthy();
    }
  });

  it('VIRALITY_COLORS covers the four virality buckets', () => {
    for (const key of ['low', 'medium', 'high', 'viral_potential']) {
      expect(VIRALITY_COLORS[key]).toMatch(/^bg-/);
    }
  });

  it('PRIORITY_COLORS covers low/medium/high/urgent', () => {
    for (const key of ['low', 'medium', 'high', 'urgent']) {
      expect(PRIORITY_COLORS[key]).toMatch(/^bg-/);
    }
  });

  it('IDEA_STATUS_LABELS covers the canonical idea statuses', () => {
    expect(IDEA_STATUS_LABELS).toEqual({
      idea: 'Idea',
      approved: 'Approved',
      in_production: 'In Production',
      published: 'Published',
      archived: 'Archived',
    });
  });
});
