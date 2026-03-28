import { describe, expect, it } from 'vitest';
import { bestTextColor, contrastRatio, relativeLuminance } from '@/lib/ad-creatives/compositor/color-utils';

describe('color-utils', () => {
  it('relativeLuminance is 0–1', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 1);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 2);
  });

  it('contrastRatio white on black is high', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeGreaterThan(20);
  });

  it('bestTextColor picks white on dark bg', () => {
    expect(bestTextColor('#111111')).toBe('#FFFFFF');
  });

  it('bestTextColor picks black on light bg', () => {
    expect(bestTextColor('#EEEEEE')).toBe('#000000');
  });
});
