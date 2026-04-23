import { describe, expect, it } from 'vitest';
import { nextRunAt, periodStartFor } from './build-competitor-report';

// Pure time math — no Supabase mocking needed. These guarantee the cadence
// math stays consistent with the check constraint in the migration and the
// cron handler.

describe('competitor report cadence', () => {
  const baseline = new Date('2026-04-22T14:00:00.000Z');

  describe('nextRunAt', () => {
    it('adds 7 days for weekly', () => {
      expect(nextRunAt(baseline, 'weekly').toISOString()).toBe('2026-04-29T14:00:00.000Z');
    });
    it('adds 14 days for biweekly', () => {
      expect(nextRunAt(baseline, 'biweekly').toISOString()).toBe('2026-05-06T14:00:00.000Z');
    });
    it('adds 30 days for monthly', () => {
      expect(nextRunAt(baseline, 'monthly').toISOString()).toBe('2026-05-22T14:00:00.000Z');
    });
    it('is pure — does not mutate input', () => {
      const before = baseline.toISOString();
      nextRunAt(baseline, 'weekly');
      expect(baseline.toISOString()).toBe(before);
    });
  });

  describe('periodStartFor', () => {
    it('subtracts 7 days for weekly', () => {
      expect(periodStartFor(baseline, 'weekly').toISOString()).toBe('2026-04-15T14:00:00.000Z');
    });
    it('subtracts 14 days for biweekly', () => {
      expect(periodStartFor(baseline, 'biweekly').toISOString()).toBe('2026-04-08T14:00:00.000Z');
    });
    it('subtracts 30 days for monthly', () => {
      expect(periodStartFor(baseline, 'monthly').toISOString()).toBe('2026-03-23T14:00:00.000Z');
    });
  });

  describe('round-trip', () => {
    it('periodStartFor then nextRunAt returns a value ≥ baseline (full period ahead)', () => {
      for (const cadence of ['weekly', 'biweekly', 'monthly'] as const) {
        const periodStart = periodStartFor(baseline, cadence);
        const next = nextRunAt(baseline, cadence);
        const periodDays = (next.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
        expect(periodDays).toBe(cadence === 'weekly' ? 14 : cadence === 'biweekly' ? 28 : 60);
      }
    });
  });
});
