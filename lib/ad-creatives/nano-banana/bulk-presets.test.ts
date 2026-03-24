import { describe, it, expect } from 'vitest';
import {
  buildMetaPerformanceSlotOrder,
  aggregateSlotOrderToGlobalVariations,
  globalSlotOrderMatchesVariations,
  META_PERFORMANCE_BUCKETS_BASE,
} from './bulk-presets';

describe('buildMetaPerformanceSlotOrder', () => {
  it('produces 100 slots with exact Goldback bucket counts', () => {
    const s = buildMetaPerformanceSlotOrder(100);
    expect(s.length).toBe(100);
    const counts = new Map<string, number>();
    for (const slug of s) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    for (const b of META_PERFORMANCE_BUCKETS_BASE) {
      expect(counts.get(b.slug)).toBe(b.n);
    }
  });

  it('matches aggregate gtv for arbitrary N', () => {
    for (const n of [1, 7, 50, 143]) {
      const slot = buildMetaPerformanceSlotOrder(n);
      expect(slot.length).toBe(n);
      const gtv = aggregateSlotOrderToGlobalVariations(slot);
      expect(globalSlotOrderMatchesVariations(slot, gtv)).toBe(true);
    }
  });
});
