import { describe, expect, it } from 'vitest';
import { distributeSlots } from '../distribute-slots';

// All slots are pinned to 12:00 America/Chicago. April-October that's CDT
// (UTC-5) → 17:00 UTC; November-March that's CST (UTC-6) → 18:00 UTC.
const CDT_NOON_UTC = (date: string) => `${date}T17:00:00.000Z`;
const CST_NOON_UTC = (date: string) => `${date}T18:00:00.000Z`;

describe('distributeSlots', () => {
  it('returns empty when count is zero', () => {
    expect(
      distributeSlots({
        count: 0,
        startDate: '2026-04-27',
        endDate: '2026-05-03',
      }),
    ).toEqual([]);
  });

  it('places a single video on the start date at 12pm Central', () => {
    expect(
      distributeSlots({
        count: 1,
        startDate: '2026-04-27',
        endDate: '2026-05-03',
      }),
    ).toEqual([CDT_NOON_UTC('2026-04-27')]);
  });

  it('returns count slots when range is one day', () => {
    const slots = distributeSlots({
      count: 3,
      startDate: '2026-04-27',
      endDate: '2026-04-27',
    });
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => s === CDT_NOON_UTC('2026-04-27'))).toBe(true);
  });

  it('anchors first slot to start date and last slot to end date', () => {
    const slots = distributeSlots({
      count: 5,
      startDate: '2026-04-27',
      endDate: '2026-05-03',
    });
    expect(slots).toHaveLength(5);
    expect(slots[0]).toBe(CDT_NOON_UTC('2026-04-27'));
    expect(slots[4]).toBe(CDT_NOON_UTC('2026-05-03'));
  });

  it('produces evenly spaced offsets for 3 videos in a 6-day window', () => {
    const slots = distributeSlots({
      count: 3,
      startDate: '2026-04-27',
      endDate: '2026-05-02',
    });
    expect(slots[0]).toBe(CDT_NOON_UTC('2026-04-27'));
    expect(slots[2]).toBe(CDT_NOON_UTC('2026-05-02'));
    expect([CDT_NOON_UTC('2026-04-29'), CDT_NOON_UTC('2026-04-30')]).toContain(slots[1]);
  });

  it('uses CST offset (UTC-6) in winter months', () => {
    const slots = distributeSlots({
      count: 1,
      startDate: '2026-01-15',
      endDate: '2026-01-15',
    });
    expect(slots[0]).toBe(CST_NOON_UTC('2026-01-15'));
  });

  it('throws when end date is before start date', () => {
    expect(() =>
      distributeSlots({
        count: 1,
        startDate: '2026-04-27',
        endDate: '2026-04-26',
      }),
    ).toThrow();
  });

  it('rejects malformed dates', () => {
    expect(() =>
      distributeSlots({
        count: 1,
        startDate: 'not-a-date',
        endDate: '2026-04-27',
      }),
    ).toThrow();
  });
});
