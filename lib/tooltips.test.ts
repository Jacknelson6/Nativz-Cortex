import { describe, expect, it } from 'vitest';
import { TOOLTIPS, type TooltipDef } from './tooltips';

/**
 * `TOOLTIPS` is the static map every UI surface reads to render hover
 * help text. Three contracts to pin:
 *
 *   1. Every key actively used in the codebase still resolves to a real
 *      definition. The map is keyed on string literals at the call sites
 *      (`TOOLTIPS.views`, `TOOLTIPS.sentiment`, etc.); a rename or delete
 *      here would silently render `undefined.title` and crash the
 *      rendering component. The anchor list below is the load-bearing
 *      set of keys grepped from .tsx call sites at write time.
 *
 *   2. Every entry has populated, copy-clean title and description
 *      strings. An empty string would render an empty tooltip bubble; a
 *      whitespace-only string is the same regression with an extra step.
 *
 *   3. No accidental em-dashes. The project rule (CLAUDE.md) bans U+2014
 *      and U+2013 in product copy. UI tooltips show up in screenshots
 *      and PDFs, so a stray dash would slip past code review and into
 *      client-facing material.
 */

const ANCHOR_KEYS_USED_AT_CALL_SITES = [
  'views',
  'resonance',
  'sentiment',
  'trending_topic_copy',
  'pillar_pct_of_content',
  'pillar_er_typical',
  'pillar_er_your',
] as const;

describe('TOOLTIPS — load-bearing keys still resolve', () => {
  for (const key of ANCHOR_KEYS_USED_AT_CALL_SITES) {
    it(`${key} resolves to a defined entry (referenced at .tsx call sites)`, () => {
      const def: TooltipDef | undefined = TOOLTIPS[key];
      expect(def, `TOOLTIPS.${key} missing — call sites would crash`).toBeDefined();
      expect(typeof def!.title).toBe('string');
      expect(typeof def!.description).toBe('string');
    });
  }
});

describe('TOOLTIPS — every entry is well-formed', () => {
  it('has a non-empty title', () => {
    for (const [key, def] of Object.entries(TOOLTIPS)) {
      expect(def.title.length, `${key}.title is empty`).toBeGreaterThan(0);
      expect(def.title.trim().length, `${key}.title is whitespace`).toBeGreaterThan(0);
    }
  });

  it('has a non-empty description', () => {
    for (const [key, def] of Object.entries(TOOLTIPS)) {
      expect(def.description.length, `${key}.description is empty`).toBeGreaterThan(0);
      expect(def.description.trim().length, `${key}.description is whitespace`).toBeGreaterThan(0);
    }
  });

  it('has only `title` and `description` keys (no leaked extras)', () => {
    // Defensive: a regression that added inline styling/markup fields
    // would flow into the rendering component as unknown props. Pin the
    // exact shape so additions are deliberate.
    for (const [key, def] of Object.entries(TOOLTIPS)) {
      const keys = Object.keys(def).sort();
      expect(keys, `${key} extra fields`).toEqual(['description', 'title']);
    }
  });
});

describe('TOOLTIPS — copy hygiene (em-dashes banned per CLAUDE.md)', () => {
  it('no em-dash (U+2014) in any title or description', () => {
    for (const [key, def] of Object.entries(TOOLTIPS)) {
      expect(def.title.includes('—'), `${key}.title contains em-dash`).toBe(false);
      expect(def.description.includes('—'), `${key}.description contains em-dash`).toBe(false);
    }
  });

  it('no en-dash (U+2013) in any title or description', () => {
    for (const [key, def] of Object.entries(TOOLTIPS)) {
      expect(def.title.includes('–'), `${key}.title contains en-dash`).toBe(false);
      expect(def.description.includes('–'), `${key}.description contains en-dash`).toBe(false);
    }
  });
});

describe('TOOLTIPS — known anchor copy (rename detection)', () => {
  // Light pin so a renamed key surfaces in the test diff. Specifically
  // pin tooltip TITLES (not full descriptions) since titles are what
  // appear on small UI surfaces, while descriptions are allowed to be
  // wordsmithed without breaking the contract.
  it('sentiment renders title "Sentiment"', () => {
    expect(TOOLTIPS.sentiment.title).toBe('Sentiment');
  });

  it('resonance renders title "Resonance"', () => {
    expect(TOOLTIPS.resonance.title).toBe('Resonance');
  });

  it('views renders title "Views"', () => {
    expect(TOOLTIPS.views.title).toBe('Views');
  });

  it('total_views and views describe the same metric (so the map can be flattened later if needed)', () => {
    // Defensive: there are two keys ('views' and 'total_views') with the
    // same description, intentional duplication for legacy call sites.
    // A regression that diverged them would create silent UX drift.
    expect(TOOLTIPS.total_views.description).toBe(TOOLTIPS.views.description);
  });
});
