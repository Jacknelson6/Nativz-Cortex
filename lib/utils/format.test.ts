import { describe, expect, it } from 'vitest';
import {
  formatCompactCount,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatSentimentScore,
  sentimentBgColor,
  sentimentColor,
} from './format';

const EM_DASH = '—';

/**
 * format.ts is the cross-cutting display helper bag. Two contracts
 * worth pinning hard:
 *
 *   - formatCompactCount renders dashboard counts ("211.82K") with
 *     TWO fractional digits, while formatNumber renders ONE
 *     ("211.8K"). They look identical at a glance and they're used
 *     in different surfaces. A regression that aligns them would
 *     either thin out the analytics tables or fatten the topic
 *     cards. Keep them distinct.
 *
 *   - formatCompactCount falls back to the em-dash placeholder for
 *     non-finite or negative inputs. Other formatters do not — the
 *     dashboard tables rely on this divergence to render empty
 *     cells without an explicit `?? '—'` at every call site.
 */

describe('formatNumber — one-decimal compact', () => {
  it('formats sub-thousand values via toLocaleString (no suffix)', () => {
    expect(formatNumber(842)).toBe('842');
  });

  it('formats thousands as "<n.x>K"', () => {
    expect(formatNumber(15_000)).toBe('15.0K');
    expect(formatNumber(15_490)).toBe('15.5K');
  });

  it('formats millions as "<n.x>M"', () => {
    expect(formatNumber(2_500_000)).toBe('2.5M');
  });

  it('does NOT clamp negatives or non-finite (different contract from formatCompactCount)', () => {
    expect(formatNumber(-15_000)).toBe('-15,000');
  });
});

describe('formatCompactCount — two-decimal compact w/ guards', () => {
  it('returns the em-dash for non-finite or negative inputs', () => {
    expect(formatCompactCount(NaN)).toBe(EM_DASH);
    expect(formatCompactCount(Infinity)).toBe(EM_DASH);
    expect(formatCompactCount(-1)).toBe(EM_DASH);
  });

  it('formats sub-thousand values via toLocaleString', () => {
    expect(formatCompactCount(842)).toBe('842');
  });

  it('formats thousands with TWO fractional digits ("211.82K", not "211.8K")', () => {
    expect(formatCompactCount(211_820)).toBe('211.82K');
  });

  it('formats millions with TWO fractional digits ("2.50M", not "2.5M")', () => {
    expect(formatCompactCount(2_500_000)).toBe('2.50M');
  });
});

describe('formatPercent', () => {
  it('renders one decimal by default ("12.0%")', () => {
    expect(formatPercent(0.12)).toBe('12.0%');
  });

  it('multiplies by 100 (input is 0..1, NOT percentage points)', () => {
    expect(formatPercent(0.005)).toBe('0.5%');
  });

  it('honours a custom decimals argument', () => {
    expect(formatPercent(0.12345, 2)).toBe('12.35%');
    expect(formatPercent(0.12, 0)).toBe('12%');
  });

  it('handles negatives without flipping sign', () => {
    expect(formatPercent(-0.05)).toBe('-5.0%');
  });
});

describe('formatCurrency', () => {
  it('renders USD with the dollar sign and 2 decimals by default', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('renders zero as $0.00 (not "—")', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('renders negatives with a leading "-"', () => {
    expect(formatCurrency(-50)).toBe('-$50.00');
  });
});

describe('formatSentimentScore — 3-band thresholds', () => {
  it('returns "Positive" only for scores STRICTLY above 0.3', () => {
    expect(formatSentimentScore(0.31)).toBe('Positive');
    expect(formatSentimentScore(0.3)).toBe('Neutral');
  });

  it('returns "Neutral" for the middle band', () => {
    expect(formatSentimentScore(0)).toBe('Neutral');
    expect(formatSentimentScore(-0.29)).toBe('Neutral');
  });

  it('returns "Negative" at or below -0.3', () => {
    expect(formatSentimentScore(-0.3)).toBe('Negative');
    expect(formatSentimentScore(-1)).toBe('Negative');
  });
});

describe('sentimentColor / sentimentBgColor — same threshold pair', () => {
  it('sentimentColor maps to emerald / amber / red on the same > 0.3 / > -0.3 thresholds', () => {
    expect(sentimentColor(0.31)).toBe('text-emerald-500');
    expect(sentimentColor(0.3)).toBe('text-amber-500');
    expect(sentimentColor(-0.29)).toBe('text-amber-500');
    expect(sentimentColor(-0.3)).toBe('text-red-500');
  });

  it('sentimentBgColor maps to bg+text pairs on the same thresholds', () => {
    expect(sentimentBgColor(0.31)).toBe('bg-emerald-50 text-emerald-700');
    expect(sentimentBgColor(0)).toBe('bg-amber-50 text-amber-700');
    expect(sentimentBgColor(-1)).toBe('bg-red-50 text-red-700');
  });
});

describe('formatDate / formatDateTime — ISO and Date inputs', () => {
  it('formatDate accepts an ISO string', () => {
    expect(formatDate('2026-03-04T10:30:00Z')).toMatch(/^Mar \d, 2026$/);
  });

  it('formatDate accepts a Date instance', () => {
    expect(formatDate(new Date('2026-03-04T10:30:00Z'))).toMatch(/^Mar \d, 2026$/);
  });

  it('formatDateTime renders both date and a time component', () => {
    const out = formatDateTime('2026-03-04T15:30:00Z');
    // Avoid asserting a specific timezone: just check shape.
    expect(out).toMatch(/^Mar \d, 2026 \d{1,2}:\d{2} (AM|PM)$/);
  });
});

describe('formatRelativeTime', () => {
  it('renders a "<n> <unit> ago" suffix for past dates', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000); // ~1h ago
    expect(formatRelativeTime(past)).toMatch(/ago$/);
  });

  it('renders an "in <n> <unit>" prefix for future dates', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000); // ~1h from now
    expect(formatRelativeTime(future)).toMatch(/^in /);
  });
});
