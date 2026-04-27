import { describe, expect, it } from 'vitest';
import { distributeSlots } from '../distribute-slots';

describe('distributeSlots', () => {
  it('returns empty when count is zero', () => {
    expect(
      distributeSlots({
        count: 0,
        startDate: '2026-04-27',
        endDate: '2026-05-03',
        defaultTime: '10:00',
      }),
    ).toEqual([]);
  });

  it('places a single video on the start date at default time', () => {
    expect(
      distributeSlots({
        count: 1,
        startDate: '2026-04-27',
        endDate: '2026-05-03',
        defaultTime: '10:00',
      }),
    ).toEqual(['2026-04-27T10:00:00Z']);
  });

  it('returns count slots when range is one day', () => {
    const slots = distributeSlots({
      count: 3,
      startDate: '2026-04-27',
      endDate: '2026-04-27',
      defaultTime: '10:00',
    });
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => s === '2026-04-27T10:00:00Z')).toBe(true);
  });

  it('anchors first slot to start date and last slot to end date', () => {
    const slots = distributeSlots({
      count: 5,
      startDate: '2026-04-27',
      endDate: '2026-05-03',
      defaultTime: '10:00',
    });
    expect(slots).toHaveLength(5);
    expect(slots[0]).toBe('2026-04-27T10:00:00Z');
    expect(slots[4]).toBe('2026-05-03T10:00:00Z');
  });

  it('honors HH:MM format including non-zero minutes', () => {
    const slots = distributeSlots({
      count: 1,
      startDate: '2026-04-27',
      endDate: '2026-04-27',
      defaultTime: '14:30',
    });
    expect(slots[0]).toBe('2026-04-27T14:30:00Z');
  });

  it('produces evenly spaced offsets for 3 videos in a 6-day window', () => {
    const slots = distributeSlots({
      count: 3,
      startDate: '2026-04-27',
      endDate: '2026-05-02',
      defaultTime: '10:00',
    });
    expect(slots[0]).toBe('2026-04-27T10:00:00Z');
    expect(slots[2]).toBe('2026-05-02T10:00:00Z');
    expect(['2026-04-29T10:00:00Z', '2026-04-30T10:00:00Z']).toContain(slots[1]);
  });

  it('throws when end date is before start date', () => {
    expect(() =>
      distributeSlots({
        count: 1,
        startDate: '2026-04-27',
        endDate: '2026-04-26',
        defaultTime: '10:00',
      }),
    ).toThrow();
  });

  it('rejects malformed dates', () => {
    expect(() =>
      distributeSlots({
        count: 1,
        startDate: 'not-a-date',
        endDate: '2026-04-27',
        defaultTime: '10:00',
      }),
    ).toThrow();
  });

  it('rejects malformed time', () => {
    expect(() =>
      distributeSlots({
        count: 1,
        startDate: '2026-04-27',
        endDate: '2026-04-27',
        defaultTime: '25:00',
      }),
    ).toThrow();
  });
});
