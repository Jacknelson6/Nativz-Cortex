import { describe, expect, it } from 'vitest';
import {
  getTheme,
  allThemes,
  nativzTheme,
  andersonTheme,
  type AgencySlug,
} from './index';

/**
 * `lib/branding` is the single source of truth for per-agency theme tokens
 * consumed by PDFs, emails, the branded shell, and any other surface that
 * varies by agency. Three contracts to pin:
 *
 *   1. `getTheme` defaults to `nativzTheme` on ANY non-'anderson' input —
 *      including unknown strings, null, and undefined. Callers pass
 *      whatever `detectAgencyFromHostname` returns (which can be null on
 *      unknown hosts) without null-guarding, and the safe fallback is the
 *      default Nativz brand. A regression that returned undefined on
 *      unknown input would crash every PDF render with "Cannot read
 *      properties of undefined (reading 'colors')".
 *
 *   2. Each theme's `slug` is the literal that `getTheme` matches on —
 *      'nativz' and 'anderson'. The slug doubles as the discriminator
 *      consumers use to compare themes ("if (theme.slug === 'anderson')").
 *      A typo in either slug would silently route Anderson PDFs through
 *      the Nativz default.
 *
 *   3. Required theme fields (slug / name / shortName / domain / supportEmail
 *      / colors.primary / colors.dark / fonts.heading / logos.svg / logos.png)
 *      are populated and non-empty for both themes. The PDF + email pipelines
 *      destructure these directly; an empty `supportEmail` would render
 *      `mailto:` in client-facing copy.
 */

describe('getTheme — slug dispatch', () => {
  it('returns nativzTheme for slug "nativz"', () => {
    expect(getTheme('nativz')).toBe(nativzTheme);
  });

  it('returns andersonTheme for slug "anderson"', () => {
    expect(getTheme('anderson')).toBe(andersonTheme);
  });
});

describe('getTheme — defensive fallbacks', () => {
  it('defaults to nativzTheme on null', () => {
    // Pin: detectAgencyFromHostname can return null for unknown hosts.
    // Passing that through must NOT throw or return undefined.
    expect(getTheme(null)).toBe(nativzTheme);
  });

  it('defaults to nativzTheme on undefined', () => {
    expect(getTheme(undefined)).toBe(nativzTheme);
  });

  it('defaults to nativzTheme on an unknown slug', () => {
    expect(getTheme('mystery-agency')).toBe(nativzTheme);
  });

  it('defaults to nativzTheme on empty string', () => {
    expect(getTheme('')).toBe(nativzTheme);
  });

  it('does NOT match a casing variant of "Anderson" (slugs are exact)', () => {
    // Pin: case-sensitive equality. A regression to `.toLowerCase()` could
    // silently match upper-case header values that should fall through.
    expect(getTheme('Anderson')).toBe(nativzTheme);
    expect(getTheme('ANDERSON')).toBe(nativzTheme);
  });

  it('does NOT match the long form "anderson-collaborative"', () => {
    // The slug is the literal "anderson"; the full agency name is not a
    // valid slug. Same defensive intent as brand-from-request.
    expect(getTheme('anderson-collaborative')).toBe(nativzTheme);
  });

  it('always returns a defined theme (never undefined / null)', () => {
    const inputs: unknown[] = [null, undefined, '', 'unknown', 0, false, {}, []];
    for (const input of inputs) {
      const t = getTheme(input as AgencySlug | string | null | undefined);
      expect(t).toBeDefined();
      expect(t).toBe(nativzTheme);
    }
  });
});

describe('allThemes — registry list', () => {
  it('contains both themes', () => {
    expect(allThemes).toContain(nativzTheme);
    expect(allThemes).toContain(andersonTheme);
  });

  it('has exactly two entries (no duplicates, no extras)', () => {
    expect(allThemes.length).toBe(2);
  });

  it('exposes themes in {nativz, anderson} order so admin UIs render Nativz first', () => {
    // Pin: the registry order is the order admin UIs (theme switchers,
    // brand pickers) list themes. Nativz is the default agency, so it
    // should be the first list entry.
    expect(allThemes[0]).toBe(nativzTheme);
    expect(allThemes[1]).toBe(andersonTheme);
  });
});

describe('nativzTheme — required fields populated', () => {
  it('has slug "nativz" so getTheme dispatches correctly', () => {
    expect(nativzTheme.slug).toBe('nativz');
  });

  it('has display name "Nativz"', () => {
    expect(nativzTheme.name).toBe('Nativz');
  });

  it('has populated shortName, domain, supportEmail', () => {
    expect(nativzTheme.shortName.length).toBeGreaterThan(0);
    expect(nativzTheme.domain).toMatch(/^https?:\/\//);
    expect(nativzTheme.supportEmail).toMatch(/^[^@]+@[^@]+$/);
  });

  it('has primary, dark, and surface colors populated', () => {
    expect(nativzTheme.colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(nativzTheme.colors.dark).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(nativzTheme.colors.primarySurface.length).toBeGreaterThan(0);
  });

  it('has heading + body + mono fonts populated', () => {
    expect(nativzTheme.fonts.heading.length).toBeGreaterThan(0);
    expect(nativzTheme.fonts.body.length).toBeGreaterThan(0);
    expect(nativzTheme.fonts.mono.length).toBeGreaterThan(0);
  });

  it('has both svg and png logo paths set (PDF renderer needs both)', () => {
    expect(nativzTheme.logos.svg).toMatch(/^\//);
    expect(nativzTheme.logos.png).toMatch(/^\//);
    expect(nativzTheme.logos.svgOnDark).toMatch(/^\//);
  });
});

describe('andersonTheme — required fields populated', () => {
  it('has slug "anderson" so getTheme dispatches correctly', () => {
    expect(andersonTheme.slug).toBe('anderson');
  });

  it('has display name "Anderson Collaborative" and shortName "AC"', () => {
    expect(andersonTheme.name).toBe('Anderson Collaborative');
    expect(andersonTheme.shortName).toBe('AC');
  });

  it('has populated domain + supportEmail (used in email footers + PDFs)', () => {
    expect(andersonTheme.domain).toMatch(/^https?:\/\//);
    expect(andersonTheme.supportEmail).toMatch(/^[^@]+@[^@]+$/);
  });

  it('has primary, dark, and surface colors populated', () => {
    expect(andersonTheme.colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(andersonTheme.colors.dark).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(andersonTheme.colors.primarySurface.length).toBeGreaterThan(0);
  });

  it('uses a different primary than nativz (the whole point of theming)', () => {
    // Defensive: a regression that copied the same primary into both
    // themes would render Anderson PDFs in Nativz blue. Pin distinctness.
    expect(andersonTheme.colors.primary).not.toBe(nativzTheme.colors.primary);
  });

  it('uses different fonts than nativz (theme-distinct typography)', () => {
    // The agencies have different brand stacks (Poppins vs Rubik/Roboto).
    // A regression that pointed Anderson at the Nativz fonts would render
    // every AC-branded PDF in the wrong typeface.
    expect(andersonTheme.fonts.heading).not.toBe(nativzTheme.fonts.heading);
  });

  it('has both svg and png logo paths set', () => {
    expect(andersonTheme.logos.svg).toMatch(/^\//);
    expect(andersonTheme.logos.png).toMatch(/^\//);
    expect(andersonTheme.logos.svgOnDark).toMatch(/^\//);
  });
});

describe('module exports', () => {
  it('re-exports both theme constants and the AgencySlug type marker', () => {
    expect(nativzTheme).toBeDefined();
    expect(andersonTheme).toBeDefined();
    expect(typeof getTheme).toBe('function');
    expect(Array.isArray(allThemes)).toBe(true);
  });
});
