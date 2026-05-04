import { describe, expect, it } from 'vitest';
import { getHealthColor, getHealthLabel } from './health';

describe('getHealthLabel', () => {
  it('returns "New" when isNew is true regardless of score', () => {
    expect(getHealthLabel(0, true)).toBe('New');
    expect(getHealthLabel(50, true)).toBe('New');
    expect(getHealthLabel(100, true)).toBe('New');
  });

  it('returns "Healthy" for scores 80 and up', () => {
    expect(getHealthLabel(80, false)).toBe('Healthy');
    expect(getHealthLabel(95, false)).toBe('Healthy');
    expect(getHealthLabel(100, false)).toBe('Healthy');
  });

  it('returns "Good" for scores in 60..79', () => {
    expect(getHealthLabel(60, false)).toBe('Good');
    expect(getHealthLabel(70, false)).toBe('Good');
    expect(getHealthLabel(79, false)).toBe('Good');
  });

  it('returns "Needs Attention" for scores in 40..59', () => {
    expect(getHealthLabel(40, false)).toBe('Needs Attention');
    expect(getHealthLabel(50, false)).toBe('Needs Attention');
    expect(getHealthLabel(59, false)).toBe('Needs Attention');
  });

  it('returns "At Risk" for scores in 20..39', () => {
    expect(getHealthLabel(20, false)).toBe('At Risk');
    expect(getHealthLabel(30, false)).toBe('At Risk');
    expect(getHealthLabel(39, false)).toBe('At Risk');
  });

  it('returns "Critical" for scores below 20', () => {
    expect(getHealthLabel(0, false)).toBe('Critical');
    expect(getHealthLabel(19, false)).toBe('Critical');
  });

  it('treats negative scores as "Critical" (defensive)', () => {
    expect(getHealthLabel(-5, false)).toBe('Critical');
  });
});

describe('getHealthColor', () => {
  it('returns emerald palette for "Healthy"', () => {
    const c = getHealthColor('Healthy');
    expect(c.text).toBe('text-emerald-400');
    expect(c.ring).toBe('stroke-emerald-400');
  });

  it('returns blue palette for "Good"', () => {
    expect(getHealthColor('Good').text).toBe('text-blue-400');
  });

  it('returns amber palette for "Needs Attention"', () => {
    expect(getHealthColor('Needs Attention').text).toBe('text-amber-400');
  });

  it('returns orange palette for "At Risk"', () => {
    expect(getHealthColor('At Risk').text).toBe('text-orange-400');
  });

  it('returns red palette for "Critical"', () => {
    expect(getHealthColor('Critical').text).toBe('text-red-400');
  });

  it('returns zinc palette for "New"', () => {
    expect(getHealthColor('New').text).toBe('text-zinc-400');
  });

  it('returns matching bg/text/border/ring tokens for every label', () => {
    const labels = ['Healthy', 'Good', 'Needs Attention', 'At Risk', 'Critical', 'New'] as const;
    for (const label of labels) {
      const c = getHealthColor(label);
      expect(c).toBeDefined();
      expect(typeof c?.bg).toBe('string');
      expect(typeof c?.text).toBe('string');
      expect(typeof c?.border).toBe('string');
      expect(typeof c?.ring).toBe('string');
    }
  });
});
