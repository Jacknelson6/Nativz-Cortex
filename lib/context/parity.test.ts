import { describe, expect, it } from 'vitest';
import { jaccardIds, overlapAtK } from '@/lib/context/parity';

describe('overlapAtK', () => {
  it('computes fraction of shadow top-k that appear in primary top-k', () => {
    const primary = ['a', 'b', 'c', 'd', 'e'];
    const shadow = ['a', 'x', 'b', 'y', 'z'];
    expect(overlapAtK(primary, shadow, 5)).toBe(2 / 5);
  });

  it('returns 0 when k is 0', () => {
    expect(overlapAtK(['a'], ['a'], 0)).toBe(0);
  });
});

describe('jaccardIds', () => {
  it('computes Jaccard similarity', () => {
    expect(jaccardIds(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(0.5); // inter 2, union 4
  });
});
