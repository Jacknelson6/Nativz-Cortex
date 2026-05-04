import { describe, expect, it } from 'vitest';
import { distributeSlots } from './distribute-slots';

/**
 * Distribution semantics: every slot is 12:00 America/Chicago, expressed as
 * UTC ISO. Chicago is UTC-6 (CST) Nov-Mar and UTC-5 (CDT) Mar-Nov, so noon
 * Chicago = 18:00Z in winter and 17:00Z in summer. Tests pin both seasons
 * to catch DST regressions.
 */

describe('distributeSlots', () => {
  describe('input validation', () => {
    it('returns [] for count = 0', () => {
      expect(
        distributeSlots({ count: 0, startDate: '2026-06-01', endDate: '2026-06-30' }),
      ).toEqual([]);
    });

    it('returns [] for negative count', () => {
      expect(
        distributeSlots({ count: -3, startDate: '2026-06-01', endDate: '2026-06-30' }),
      ).toEqual([]);
    });

    it('throws on malformed startDate', () => {
      expect(() =>
        distributeSlots({ count: 5, startDate: '2026/06/01', endDate: '2026-06-30' }),
      ).toThrow('Dates must be YYYY-MM-DD');
    });

    it('throws on malformed endDate', () => {
      expect(() =>
        distributeSlots({ count: 5, startDate: '2026-06-01', endDate: 'June 30' }),
      ).toThrow('Dates must be YYYY-MM-DD');
    });

    it('throws on partial date (e.g. 2026-6-1)', () => {
      expect(() =>
        distributeSlots({ count: 5, startDate: '2026-6-1', endDate: '2026-06-30' }),
      ).toThrow('Dates must be YYYY-MM-DD');
    });

    it('throws when endDate < startDate', () => {
      expect(() =>
        distributeSlots({ count: 3, startDate: '2026-06-30', endDate: '2026-06-01' }),
      ).toThrow('End date must be on or after start date');
    });

    it('accepts startDate === endDate (zero-day window)', () => {
      const result = distributeSlots({
        count: 3,
        startDate: '2026-06-15',
        endDate: '2026-06-15',
      });
      expect(result).toHaveLength(3);
      expect(new Set(result).size).toBe(1); // all on same day
    });

    it('throws on malformed defaultTime when supplied', () => {
      expect(() =>
        distributeSlots({
          count: 3,
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          defaultTime: '12pm',
        }),
      ).toThrow('defaultTime must be HH:MM');
    });

    it('throws on out-of-range hour in defaultTime', () => {
      expect(() =>
        distributeSlots({
          count: 3,
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          defaultTime: '25:00',
        }),
      ).toThrow('defaultTime must be HH:MM');
    });

    it('accepts (and ignores) a valid defaultTime', () => {
      const withTime = distributeSlots({
        count: 3,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        defaultTime: '09:30',
      });
      const withoutTime = distributeSlots({
        count: 3,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
      expect(withTime).toEqual(withoutTime);
    });
  });

  describe('distribution math', () => {
    it('count = 1 lands on the startDate', () => {
      const [slot] = distributeSlots({
        count: 1,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
      expect(slot!.slice(0, 10)).toBe('2026-06-01');
    });

    it('count = 2 lands on start and end exactly', () => {
      const slots = distributeSlots({
        count: 2,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
      expect(slots[0]!.slice(0, 10)).toBe('2026-06-01');
      expect(slots[1]!.slice(0, 10)).toBe('2026-06-30');
    });

    it('count = 3 distributes evenly across the range', () => {
      // 30 days, 3 slots: indices 0, 14.5 -> 15, 29 in 0-indexed days
      const slots = distributeSlots({
        count: 3,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
      expect(slots[0]!.slice(0, 10)).toBe('2026-06-01');
      expect(slots[1]!.slice(0, 10)).toBe('2026-06-16'); // 1 + round((1*29)/2) = 1+15 = 16
      expect(slots[2]!.slice(0, 10)).toBe('2026-06-30');
    });

    it('returns slots in chronological order', () => {
      const slots = distributeSlots({
        count: 8,
        startDate: '2026-06-01',
        endDate: '2026-07-31',
      });
      const dateStrings = slots.map((s) => s.slice(0, 10));
      const sorted = [...dateStrings].sort();
      expect(dateStrings).toEqual(sorted);
    });

    it('count > totalDays produces some duplicate dates without crashing', () => {
      const slots = distributeSlots({
        count: 10,
        startDate: '2026-06-01',
        endDate: '2026-06-05', // only 5 days available
      });
      expect(slots).toHaveLength(10);
      // First and last should still pin to bounds
      expect(slots[0]!.slice(0, 10)).toBe('2026-06-01');
      expect(slots[9]!.slice(0, 10)).toBe('2026-06-05');
    });

    it('crosses month boundaries cleanly', () => {
      const slots = distributeSlots({
        count: 3,
        startDate: '2026-06-29',
        endDate: '2026-07-03',
      });
      expect(slots[0]!.slice(0, 10)).toBe('2026-06-29');
      expect(slots[2]!.slice(0, 10)).toBe('2026-07-03');
    });

    it('crosses year boundaries cleanly', () => {
      const slots = distributeSlots({
        count: 4,
        startDate: '2026-12-30',
        endDate: '2027-01-02',
      });
      expect(slots.map((s) => s.slice(0, 10))).toEqual([
        '2026-12-30',
        '2026-12-31',
        '2027-01-01',
        '2027-01-02',
      ]);
    });
  });

  describe('America/Chicago noon -> UTC mapping', () => {
    it('uses 17:00Z in summer (CDT, UTC-5)', () => {
      const [slot] = distributeSlots({
        count: 1,
        startDate: '2026-07-15',
        endDate: '2026-07-15',
      });
      expect(slot).toBe('2026-07-15T17:00:00.000Z');
    });

    it('uses 18:00Z in winter (CST, UTC-6)', () => {
      const [slot] = distributeSlots({
        count: 1,
        startDate: '2026-01-15',
        endDate: '2026-01-15',
      });
      expect(slot).toBe('2026-01-15T18:00:00.000Z');
    });

    it('handles the spring-forward day correctly', () => {
      // 2026-03-08 02:00 -> 03:00 in Chicago. Noon that day is CDT (17:00Z).
      const [slot] = distributeSlots({
        count: 1,
        startDate: '2026-03-08',
        endDate: '2026-03-08',
      });
      expect(slot).toBe('2026-03-08T17:00:00.000Z');
    });

    it('handles the fall-back day correctly', () => {
      // 2026-11-01 02:00 -> 01:00 in Chicago. Noon that day is CST (18:00Z).
      const [slot] = distributeSlots({
        count: 1,
        startDate: '2026-11-01',
        endDate: '2026-11-01',
      });
      expect(slot).toBe('2026-11-01T18:00:00.000Z');
    });

    it('produces parseable ISO strings', () => {
      const slots = distributeSlots({
        count: 5,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
      for (const s of slots) {
        expect(Number.isFinite(new Date(s).getTime())).toBe(true);
        expect(s).toMatch(/T\d{2}:00:00\.000Z$/); // always on the hour
      }
    });
  });
});
