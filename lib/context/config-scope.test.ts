import { describe, expect, it } from 'vitest';
import { scopeIncludesAgency, scopeIncludesClient } from '@/lib/context/config';

describe('context platform scope', () => {
  it('both enables client and agency', () => {
    expect(scopeIncludesClient('both')).toBe(true);
    expect(scopeIncludesAgency('both')).toBe(true);
  });

  it('client scope limits to client retrieval only', () => {
    expect(scopeIncludesClient('client')).toBe(true);
    expect(scopeIncludesAgency('client')).toBe(false);
  });

  it('agency scope limits to agency retrieval only', () => {
    expect(scopeIncludesClient('agency')).toBe(false);
    expect(scopeIncludesAgency('agency')).toBe(true);
  });
});
