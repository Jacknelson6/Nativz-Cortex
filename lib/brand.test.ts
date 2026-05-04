import { describe, expect, it } from 'vitest';
import { NATIVZ_BRAND } from './brand';

/**
 * `NATIVZ_BRAND` is the static brand-token map that PDF templates,
 * email senders, and the marketing surfaces import. Three contracts
 * to pin:
 *
 *   1. The token shape stays stable. Templates index the map with
 *      string literals like `NATIVZ_BRAND.colors.primary`; renaming a
 *      key would compile in TS but blow up in a @react-pdf string
 *      replacement that uses the literal at runtime. Pin the load-bearing
 *      keys so a delete surfaces in the test diff.
 *
 *   2. Every color is a valid hex or rgba string. A typo like '#04bbd2'
 *      vs '#046bd2' would silently render the wrong accent across every
 *      branded surface; harder to catch is a non-color string ('blue',
 *      'primary') leaking in from a refactor.
 *
 *   3. No em-dash (U+2014) or en-dash (U+2013) anywhere. Tagline and
 *      product name show up in screenshots, PDFs, and CSV exports
 *      shipped to clients; the project rule (CLAUDE.md) is that those
 *      characters never appear in product copy.
 */

const REQUIRED_COLOR_KEYS = [
  'primary',
  'primaryHover',
  'background',
  'surface',
  'surfaceHover',
  'border',
  'text',
  'textSecondary',
  'textMuted',
  'accent',
  'accentSurface',
  'success',
  'warning',
  'danger',
] as const;

describe('NATIVZ_BRAND — top-level shape', () => {
  it('exposes name, productName, and tagline as non-empty strings', () => {
    expect(NATIVZ_BRAND.name.trim().length).toBeGreaterThan(0);
    expect(NATIVZ_BRAND.productName.trim().length).toBeGreaterThan(0);
    expect(NATIVZ_BRAND.tagline.trim().length).toBeGreaterThan(0);
  });

  it('uses "Nativz" as the brand name and "Nativz Cortex" as the product', () => {
    // Pin: PDF templates and email senders hardcode the brand string in
    // a few places; if this ever changes we need a deliberate rename
    // sweep, not a silent drift.
    expect(NATIVZ_BRAND.name).toBe('Nativz');
    expect(NATIVZ_BRAND.productName).toBe('Nativz Cortex');
  });

  it('has the four sub-namespaces colors / fonts / logos and they are objects', () => {
    expect(typeof NATIVZ_BRAND.colors).toBe('object');
    expect(typeof NATIVZ_BRAND.fonts).toBe('object');
    expect(typeof NATIVZ_BRAND.logos).toBe('object');
  });
});

describe('NATIVZ_BRAND — colors palette', () => {
  it('exposes every load-bearing color key', () => {
    for (const key of REQUIRED_COLOR_KEYS) {
      expect(NATIVZ_BRAND.colors[key], `colors.${key} missing`).toBeDefined();
      expect(typeof NATIVZ_BRAND.colors[key]).toBe('string');
    }
  });

  it('every color is a hex (#RRGGBB or #RGB) or rgba(...) string', () => {
    // Pin: a stray "blue" or "primary" name leaking in would crash any
    // consumer that passes the value to a CSS-in-JS fillColor or a
    // @react-pdf style.
    const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    const rgba = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/;
    for (const [key, value] of Object.entries(NATIVZ_BRAND.colors)) {
      expect(
        hex.test(value) || rgba.test(value),
        `colors.${key} = ${value} is not a hex or rgba string`,
      ).toBe(true);
    }
  });

  it('primary equals accent (single brand color, two semantic names)', () => {
    // Defensive: the design system intentionally aliases `accent` to
    // `primary` so callers can use whichever name reads better.
    // A regression that diverged them would create a subtle off-brand
    // accent in the PDF templates that pull from `accent`.
    expect(NATIVZ_BRAND.colors.accent).toBe(NATIVZ_BRAND.colors.primary);
  });
});

describe('NATIVZ_BRAND — fonts and logos', () => {
  it('declares both heading and body fonts', () => {
    expect(typeof NATIVZ_BRAND.fonts.heading).toBe('string');
    expect(typeof NATIVZ_BRAND.fonts.body).toBe('string');
    expect(NATIVZ_BRAND.fonts.heading.length).toBeGreaterThan(0);
    expect(NATIVZ_BRAND.fonts.body.length).toBeGreaterThan(0);
  });

  it('exposes the three logo variants as paths under /', () => {
    // Pin: the three keys are the contract — full / mark / white.
    // PDFs and email templates branch on these by name. Whatever the
    // path resolves to, it has to start with `/` (public asset path).
    expect(NATIVZ_BRAND.logos.full.startsWith('/')).toBe(true);
    expect(NATIVZ_BRAND.logos.mark.startsWith('/')).toBe(true);
    expect(NATIVZ_BRAND.logos.white.startsWith('/')).toBe(true);
  });
});

describe('NATIVZ_BRAND — copy hygiene (em-dashes banned per CLAUDE.md)', () => {
  it('no em-dash (U+2014) anywhere in the string-valued tokens', () => {
    walkStrings(NATIVZ_BRAND, (path, value) => {
      expect(value.includes('—'), `${path} contains em-dash`).toBe(false);
    });
  });

  it('no en-dash (U+2013) anywhere in the string-valued tokens', () => {
    walkStrings(NATIVZ_BRAND, (path, value) => {
      expect(value.includes('–'), `${path} contains en-dash`).toBe(false);
    });
  });
});

function walkStrings(
  obj: unknown,
  visit: (path: string, value: string) => void,
  prefix = 'NATIVZ_BRAND',
) {
  if (typeof obj === 'string') {
    visit(prefix, obj);
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      walkStrings(v, visit, `${prefix}.${k}`);
    }
  }
}
