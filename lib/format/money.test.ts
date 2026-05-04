import { describe, expect, it } from 'vitest';
import {
  centsToDollars,
  dollarsToCents,
  formatCents,
  formatCentsCompact,
} from './money';

/**
 * money is the single source of truth for cents <-> dollars conversion and
 * currency rendering. Used by the credits ledger, payroll presets, Stripe
 * charges screen, and the capacity-accounting projections. Three contracts
 * to pin:
 *
 *   1. formatCents NEVER throws — null / undefined / NaN / Infinity all fold
 *      to "$0.00". The credits sidebar and payroll table both render this
 *      directly from possibly-null DB rows; an exception here would break
 *      the whole page rather than show a sensible zero.
 *
 *   2. formatCentsCompact only switches to the K/M/B notation at >= $1M
 *      ABSOLUTE value. The threshold is `1_000_000_00` cents = $1,000,000.
 *      Below that we keep the literal "$1,234.56" form so the per-period
 *      payroll values don't look like rough-numbers approximations.
 *
 *   3. dollarsToCents rounds half-up via Math.round, so 12.345 -> 1235
 *      cents (not 1234). Stripe's API rejects fractional cents, and the
 *      payroll preset form shows dollars-with-decimals — without rounding
 *      we'd silently truncate a half cent off every entry.
 */

describe('formatCents — happy path', () => {
  it('formats whole dollars with .00', () => {
    expect(formatCents(12300)).toBe('$123.00');
  });

  it('formats fractional cents to 2 decimals', () => {
    expect(formatCents(12345)).toBe('$123.45');
  });

  it('formats zero', () => {
    expect(formatCents(0)).toBe('$0.00');
  });

  it('formats negative cents (refund / credit reversal)', () => {
    // Intl.NumberFormat for en-US currency uses parentheses... no, actually
    // it uses a leading minus. Pin whichever form ships so a CLDR change
    // can't silently flip the sign convention without a heads-up.
    expect(formatCents(-500)).toBe('-$5.00');
  });

  it('honours an explicit currency code (uppercased)', () => {
    expect(formatCents(1000, 'eur')).toBe('€10.00');
  });
});

describe('formatCents — null / NaN safety', () => {
  it('renders null as $0.00', () => {
    expect(formatCents(null)).toBe('$0.00');
  });

  it('renders undefined as $0.00', () => {
    expect(formatCents(undefined)).toBe('$0.00');
  });

  it('renders NaN as $0.00', () => {
    expect(formatCents(Number.NaN)).toBe('$0.00');
  });

  it('renders Infinity as $0.00', () => {
    expect(formatCents(Number.POSITIVE_INFINITY)).toBe('$0.00');
    expect(formatCents(Number.NEGATIVE_INFINITY)).toBe('$0.00');
  });
});

describe('formatCentsCompact', () => {
  it('uses literal form below $1,000,000 (verbose payroll values)', () => {
    expect(formatCentsCompact(99_999_99)).toBe('$99,999.99');
  });

  it('uses literal form at exactly $999,999.99', () => {
    expect(formatCentsCompact(999_999_99)).toBe('$999,999.99');
  });

  it('switches to compact notation at >= $1,000,000', () => {
    // Intl emits "$1.0M" (one fractional digit) at the threshold; pin the
    // exact form so a CLDR/icu update flagging this is flagged loudly.
    expect(formatCentsCompact(1_000_000_00)).toBe('$1.0M');
  });

  it('compact notation also fires for large negative values (abs check)', () => {
    expect(formatCentsCompact(-2_500_000_00)).toBe('-$2.5M');
  });

  it('null / NaN folds to $0.00 (literal, never compact)', () => {
    expect(formatCentsCompact(null)).toBe('$0.00');
    expect(formatCentsCompact(Number.NaN)).toBe('$0.00');
  });
});

describe('dollarsToCents', () => {
  it('converts whole dollars to cents', () => {
    expect(dollarsToCents(12)).toBe(1200);
  });

  it('rounds half-up', () => {
    expect(dollarsToCents(12.345)).toBe(1235);
  });

  it('rounds 12.344 down', () => {
    expect(dollarsToCents(12.344)).toBe(1234);
  });

  it('parses string input via parseFloat', () => {
    expect(dollarsToCents('45.67')).toBe(4567);
  });

  it('returns 0 for non-numeric strings (parseFloat -> NaN)', () => {
    expect(dollarsToCents('abc')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(dollarsToCents('')).toBe(0);
  });

  it('returns 0 for NaN / Infinity numeric input', () => {
    expect(dollarsToCents(Number.NaN)).toBe(0);
    expect(dollarsToCents(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('handles negative dollars', () => {
    expect(dollarsToCents(-3.21)).toBe(-321);
  });
});

describe('centsToDollars', () => {
  it('returns dollars as a float', () => {
    expect(centsToDollars(1234)).toBe(12.34);
  });

  it('returns 0 for null / undefined', () => {
    expect(centsToDollars(null)).toBe(0);
    expect(centsToDollars(undefined)).toBe(0);
  });

  it('returns 0 for NaN / Infinity', () => {
    expect(centsToDollars(Number.NaN)).toBe(0);
    expect(centsToDollars(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('roundtrips with dollarsToCents on integer-cent values', () => {
    expect(centsToDollars(dollarsToCents(99.99))).toBe(99.99);
  });
});
