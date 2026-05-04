import { describe, expect, it } from 'vitest';
import {
  centsToDollars,
  currentPeriod,
  dollarsToCents,
  labelFor,
  nextPeriod,
  periodFor,
} from './periods';

describe('periodFor', () => {
  it('returns first-half for the 1st of the month', () => {
    const p = periodFor(new Date(2026, 4, 1));
    expect(p).toEqual({
      startDate: '2026-05-01',
      endDate: '2026-05-15',
      half: 'first-half',
      label: 'May 2026 · 1-15',
    });
  });

  it('returns first-half on the 15th (boundary inclusive)', () => {
    const p = periodFor(new Date(2026, 4, 15));
    expect(p.half).toBe('first-half');
    expect(p.endDate).toBe('2026-05-15');
  });

  it('flips to second-half on the 16th', () => {
    const p = periodFor(new Date(2026, 4, 16));
    expect(p).toEqual({
      startDate: '2026-05-16',
      endDate: '2026-05-31',
      half: 'second-half',
      label: 'May 2026 · 16-31',
    });
  });

  it('ends second-half on Feb 28 in a non-leap year', () => {
    const p = periodFor(new Date(2026, 1, 20));
    expect(p.endDate).toBe('2026-02-28');
    expect(p.label).toBe('Feb 2026 · 16-28');
  });

  it('ends second-half on Feb 29 in a leap year', () => {
    const p = periodFor(new Date(2024, 1, 20));
    expect(p.endDate).toBe('2024-02-29');
    expect(p.label).toBe('Feb 2024 · 16-29');
  });

  it('zero-pads single-digit months in ISO dates', () => {
    const p = periodFor(new Date(2026, 0, 5));
    expect(p.startDate).toBe('2026-01-01');
    expect(p.endDate).toBe('2026-01-15');
  });
});

describe('nextPeriod', () => {
  it('moves first-half to second-half within the same month', () => {
    const next = nextPeriod({
      startDate: '2026-05-01',
      endDate: '2026-05-15',
      half: 'first-half',
      label: 'May 2026 · 1-15',
    });
    expect(next).toEqual({
      startDate: '2026-05-16',
      endDate: '2026-05-31',
      half: 'second-half',
      label: 'May 2026 · 16-31',
    });
  });

  it('moves second-half into the next month as first-half', () => {
    const next = nextPeriod({
      startDate: '2026-05-16',
      endDate: '2026-05-31',
      half: 'second-half',
      label: 'May 2026 · 16-31',
    });
    expect(next).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-15',
      half: 'first-half',
      label: 'Jun 2026 · 1-15',
    });
  });

  it('rolls December second-half into January of the following year', () => {
    const next = nextPeriod({
      startDate: '2026-12-16',
      endDate: '2026-12-31',
      half: 'second-half',
      label: 'Dec 2026 · 16-31',
    });
    expect(next.startDate).toBe('2027-01-01');
    expect(next.endDate).toBe('2027-01-15');
    expect(next.half).toBe('first-half');
    expect(next.label).toBe('Jan 2027 · 1-15');
  });
});

describe('labelFor', () => {
  it('formats first-half labels', () => {
    expect(labelFor('2026-05-01', 'first-half')).toBe('May 2026 · 1-15');
  });

  it('formats second-half labels using the actual month length', () => {
    expect(labelFor('2026-04-16', 'second-half')).toBe('Apr 2026 · 16-30');
    expect(labelFor('2026-02-16', 'second-half')).toBe('Feb 2026 · 16-28');
    expect(labelFor('2024-02-16', 'second-half')).toBe('Feb 2024 · 16-29');
  });

  it('never emits en-dash or em-dash characters (no-dash brand rule)', () => {
    const labels = [
      labelFor('2026-05-01', 'first-half'),
      labelFor('2026-05-16', 'second-half'),
      labelFor('2026-12-16', 'second-half'),
    ];
    for (const l of labels) {
      expect(l).not.toMatch(/[–—]/);
    }
  });
});

describe('currentPeriod', () => {
  it('returns a well-formed period for "now"', () => {
    const p = currentPeriod();
    expect(p.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(['first-half', 'second-half']).toContain(p.half);
  });
});

describe('dollarsToCents', () => {
  it('rounds dollar numbers to the nearest cent', () => {
    expect(dollarsToCents(12.34)).toBe(1234);
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(0.005)).toBe(1);
    expect(dollarsToCents(0.004)).toBe(0);
  });

  it('parses string input', () => {
    expect(dollarsToCents('99.99')).toBe(9999);
    expect(dollarsToCents('1')).toBe(100);
  });

  it('falls back to 0 for non-numeric input', () => {
    expect(dollarsToCents('abc')).toBe(0);
    expect(dollarsToCents('')).toBe(0);
    expect(dollarsToCents(NaN)).toBe(0);
  });
});

describe('centsToDollars', () => {
  it('formats whole dollars with USD prefix', () => {
    expect(centsToDollars(1234)).toBe('$12.34');
    expect(centsToDollars(0)).toBe('$0.00');
    expect(centsToDollars(150000)).toBe('$1,500.00');
  });

  it('handles negative cents (refunds, adjustments)', () => {
    expect(centsToDollars(-500)).toBe('-$5.00');
  });
});
