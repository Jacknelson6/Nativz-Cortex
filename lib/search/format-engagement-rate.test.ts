import { describe, expect, it } from 'vitest';
import { formatEngagementRatePercent } from './format-engagement-rate';

const EM_DASH = '—';

/**
 * formatEngagementRatePercent renders the stored engagement rate for
 * the topic-search results UI. The pipeline has two value
 * conventions, both still in the database:
 *
 *   - **New pipeline**: percentage points (0.7 -> "0.7%", 1.5 -> "1.5%")
 *   - **Legacy merger**: 0..1 fraction (0.007 -> "0.70%")
 *
 * The function disambiguates with the rule "values strictly between 0
 * and 0.01 are fractions; everything else is percentage points." A
 * regression in the threshold either renders 1.5% as 0.02% (treating
 * a percentage as a fraction) or 0.005 as 0.0% (treating a fraction
 * as a percentage). Either way the user sees a wildly wrong number.
 */

describe('formatEngagementRatePercent — new-pipeline percentage values', () => {
  it('formats a one-decimal percentage to one decimal', () => {
    expect(formatEngagementRatePercent(0.7)).toBe('0.7%');
  });

  it('formats a multi-digit percentage to one decimal', () => {
    expect(formatEngagementRatePercent(12.345)).toBe('12.3%');
  });

  it('formats whole-number percentage with the trailing .0', () => {
    expect(formatEngagementRatePercent(5)).toBe('5.0%');
  });

  it('formats values >= 0.01 as percentages even when they look small', () => {
    // 0.01 -> "0.0%" (one-decimal toFixed). Threshold is strictly < 0.01.
    expect(formatEngagementRatePercent(0.01)).toBe('0.0%');
  });

  it('handles negative percentages without flipping into the fraction branch', () => {
    // The fraction branch is gated on value > 0; negatives stay in the
    // percentage branch (UI may use this defensively).
    expect(formatEngagementRatePercent(-1.5)).toBe('-1.5%');
  });

  it('formats exactly zero as "0.0%" (not the dash)', () => {
    // The fraction branch is gated on value > 0; zero is a valid
    // percentage and should render as such.
    expect(formatEngagementRatePercent(0)).toBe('0.0%');
  });
});

describe('formatEngagementRatePercent — legacy fraction values (0 < v < 0.01)', () => {
  it('formats a sub-1% fraction by multiplying x100 and showing two decimals', () => {
    // 0.007 represents 0.7% engagement.
    expect(formatEngagementRatePercent(0.007)).toBe('0.70%');
  });

  it('formats the just-below-threshold value with two-decimal precision', () => {
    expect(formatEngagementRatePercent(0.0099)).toBe('0.99%');
  });

  it('formats a very small fraction with two-decimal precision', () => {
    expect(formatEngagementRatePercent(0.0001)).toBe('0.01%');
  });

  it('rounds the two-decimal output of the fraction branch', () => {
    // 0.001234 * 100 = 0.1234 -> toFixed(2) -> "0.12"
    expect(formatEngagementRatePercent(0.001234)).toBe('0.12%');
  });
});

describe('formatEngagementRatePercent — null/undefined/non-finite handling', () => {
  it('returns the em-dash placeholder for null', () => {
    expect(formatEngagementRatePercent(null)).toBe(EM_DASH);
  });

  it('returns the em-dash placeholder for undefined', () => {
    expect(formatEngagementRatePercent(undefined)).toBe(EM_DASH);
  });

  it('returns the em-dash placeholder for NaN', () => {
    expect(formatEngagementRatePercent(NaN)).toBe(EM_DASH);
  });

  it('returns the em-dash placeholder for Infinity / -Infinity', () => {
    expect(formatEngagementRatePercent(Infinity)).toBe(EM_DASH);
    expect(formatEngagementRatePercent(-Infinity)).toBe(EM_DASH);
  });
});
