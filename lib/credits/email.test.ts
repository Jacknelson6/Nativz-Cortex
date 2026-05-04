import { describe, expect, it } from 'vitest';
import { detectThreshold, firstName } from './email';

describe('firstName', () => {
  it('returns the first whitespace-delimited token', () => {
    expect(firstName('Jane Doe')).toBe('Jane');
  });

  it('handles single-word names', () => {
    expect(firstName('Cher')).toBe('Cher');
  });

  it('collapses multiple internal whitespace before splitting', () => {
    expect(firstName('Jane   Anne   Doe')).toBe('Jane');
  });

  it('handles tab-separated names', () => {
    expect(firstName('Jane\tDoe')).toBe('Jane');
  });

  it('trims trailing whitespace from the resolved token', () => {
    expect(firstName('  Jane  ')).toBe('Jane');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(firstName('   ')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(firstName('')).toBe('');
  });

  it('preserves diacritics + non-ASCII letters', () => {
    expect(firstName('Renée Müller')).toBe('Renée');
  });
});

describe('detectThreshold', () => {
  it('returns null when balance does not cross either boundary', () => {
    expect(detectThreshold(5, 4)).toBeNull();
    expect(detectThreshold(10, 8)).toBeNull();
    expect(detectThreshold(2, 2)).toBeNull();
  });

  it('returns null when balance is already low and stays low (no transition)', () => {
    expect(detectThreshold(1, 1)).toBeNull();
    expect(detectThreshold(1, 0)).toBeNull();
    expect(detectThreshold(0, 0)).toBeNull();
  });

  it('returns null when balance is already negative and stays negative', () => {
    expect(detectThreshold(-1, -2)).toBeNull();
    expect(detectThreshold(-5, -10)).toBeNull();
  });

  it('returns "low_balance" when balance crosses 2 -> 1', () => {
    expect(detectThreshold(2, 1)).toBe('low_balance');
  });

  it('returns "low_balance" when balance crosses 2 -> 0', () => {
    expect(detectThreshold(2, 0)).toBe('low_balance');
  });

  it('returns "low_balance" when balance crosses from much higher to <= 1', () => {
    expect(detectThreshold(20, 1)).toBe('low_balance');
    expect(detectThreshold(20, 0)).toBe('low_balance');
  });

  it('returns "overdraft" when balance crosses 0 -> -1', () => {
    expect(detectThreshold(0, -1)).toBe('overdraft');
  });

  it('returns "overdraft" when balance crosses 5 -> -1', () => {
    expect(detectThreshold(5, -1)).toBe('overdraft');
  });

  it('returns "overdraft" (precedence) when both transitions fire in one consume', () => {
    // Pathological concurrent state: prev=2 -> new=-1 crosses BOTH the
    // low (>=2 && <=1) and overdraft (>=0 && <0) thresholds. Overdraft
    // wins because it's the more severe notification.
    expect(detectThreshold(2, -1)).toBe('overdraft');
    expect(detectThreshold(10, -3)).toBe('overdraft');
  });

  it('does NOT classify previousBalance < 0 as overdraft (already overdrawn)', () => {
    expect(detectThreshold(-1, -2)).toBeNull();
  });

  it('does NOT classify previousBalance < 2 as a low_balance transition', () => {
    // Already low, going lower without crossing zero. Most importantly
    // 1 -> 0 is NOT a transition: we already warned them at 2 -> 1.
    expect(detectThreshold(1, 0)).toBeNull();
  });
});
