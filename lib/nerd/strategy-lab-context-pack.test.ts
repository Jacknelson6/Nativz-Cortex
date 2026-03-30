import { describe, expect, it } from 'vitest';
import { truncateStrategyLabContextPack } from './strategy-lab-context-pack';

describe('truncateStrategyLabContextPack', () => {
  it('returns the original text when under the limit', () => {
    const input = '### Strategy Lab snapshot\nshort text';
    expect(truncateStrategyLabContextPack(input, 200)).toBe(input);
  });

  it('truncates oversized text and appends a token-budget marker', () => {
    const input = `### Strategy Lab snapshot\n${'x'.repeat(300)}`;
    const result = truncateStrategyLabContextPack(input, 120);

    expect(result.length).toBeLessThanOrEqual(120);
    expect(result).toContain('[truncated for token budget]');
    expect(result.startsWith('### Strategy Lab snapshot')).toBe(true);
  });
});
