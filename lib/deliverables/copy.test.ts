import { describe, expect, it } from 'vitest';
import { deliverableCopy, pluraliseDeliverable } from './copy';

/**
 * `copy.ts` is the single source of truth for client-facing deliverable
 * phrasing. Per the directional pivot doc, internal accounting language
 * stays "credits" but external surfaces speak "deliverables." These tests
 * pin the externally-visible strings so a careless edit cannot leak the
 * word "credits" into a client surface or break sentence-case formatting.
 */

describe('deliverableCopy', () => {
  it('returns sentence-case singular and plural for edited_video', () => {
    const c = deliverableCopy('edited_video');
    expect(c.singular).toBe('edited video');
    expect(c.plural).toBe('edited videos');
    expect(c.shortLabel).toBe('Edited video');
    expect(c.unitNoun).toBe('edited videos');
  });

  it('returns UGC-specific phrasing for ugc_video (not "user generated")', () => {
    const c = deliverableCopy('ugc_video');
    expect(c.singular).toBe('UGC-style video');
    expect(c.plural).toBe('UGC-style videos');
    expect(c.shortLabel).toBe('UGC video');
  });

  it('returns static_graphic phrasing without the word "image"', () => {
    const c = deliverableCopy('static_graphic');
    expect(c.singular).toBe('static graphic');
    expect(c.plural).toBe('static graphics');
    expect(c.shortLabel).toBe('Static graphic');
  });

  it('never uses the word "credits" in any client-facing field', () => {
    const slugs = ['edited_video', 'ugc_video', 'static_graphic'] as const;
    for (const slug of slugs) {
      const c = deliverableCopy(slug);
      const fields = [
        c.singular,
        c.plural,
        c.shortLabel,
        c.unitNoun,
        c.outOfHeadline,
        c.description,
      ];
      for (const f of fields) {
        expect(f.toLowerCase()).not.toContain('credit');
      }
    }
  });

  it('description ends with a period (sentence-case rule)', () => {
    const slugs = ['edited_video', 'ugc_video', 'static_graphic'] as const;
    for (const slug of slugs) {
      expect(deliverableCopy(slug).description).toMatch(/\.$/);
    }
  });

  it('outOfHeadline references "this month" so the framing is monthly', () => {
    const slugs = ['edited_video', 'ugc_video', 'static_graphic'] as const;
    for (const slug of slugs) {
      expect(deliverableCopy(slug).outOfHeadline).toContain('this month');
    }
  });
});

describe('pluraliseDeliverable', () => {
  it('uses singular for exactly 1', () => {
    expect(pluraliseDeliverable('edited_video', 1)).toBe('1 edited video');
  });

  it('uses plural for 0 (English convention: "0 videos", not "0 video")', () => {
    expect(pluraliseDeliverable('edited_video', 0)).toBe('0 edited videos');
  });

  it('uses plural for counts greater than 1', () => {
    expect(pluraliseDeliverable('edited_video', 3)).toBe('3 edited videos');
    expect(pluraliseDeliverable('ugc_video', 12)).toBe('12 UGC-style videos');
    expect(pluraliseDeliverable('static_graphic', 7)).toBe('7 static graphics');
  });

  it('uses plural for negative counts (defensive, balance can dip into overdraft)', () => {
    // -1 is technically grammatically singular in English ("minus one video")
    // but the function uses a strict equality check on 1, so we lock that
    // behaviour in: anything other than exactly 1 takes the plural branch.
    expect(pluraliseDeliverable('edited_video', -1)).toBe('-1 edited videos');
  });
});
