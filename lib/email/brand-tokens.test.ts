import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AC_EMAIL_BRAND,
  EMAIL_BRAND,
  acEmailLogoUrl,
  getEmailBrand,
  getEmailLogoUrl,
  nativzEmailLogoUrl,
} from './brand-tokens';

/**
 * Email brand tokens drive every transactional sender (drop approval,
 * onboarding intake, password recovery, calendar share). Two contracts
 * to pin:
 *
 *   1. getEmailBrand('anderson') and getEmailBrand('nativz') return
 *      visibly different palettes — getting them swapped means an AC
 *      client receives a Nativz-branded email or vice versa, which is
 *      the same class of incident as resolveAgencyFromHookPayload
 *      mis-routing. Also pin the legacy aliases (bgDark, blue, ...) so
 *      old templates that still import them stay aligned with the new
 *      light-theme palette.
 *
 *   2. The email-logo getters honour EMAIL_NATIVZ_LOGO_URL /
 *      EMAIL_AC_LOGO_URL overrides (with whitespace trimmed) and fall
 *      through to the docs-repo defaults when unset or blank. A blank
 *      override silently shadowing the default would 404 in every
 *      production email.
 */

describe('getEmailBrand', () => {
  it('returns the AC brand for "anderson"', () => {
    const b = getEmailBrand('anderson');
    expect(b.brandName).toBe('Anderson Collaborative');
    expect(b.accent).toBe('#36D1C2');
    expect(b.websiteUrl).toBe('https://andersoncollaborative.com');
  });

  it('returns the Nativz brand for "nativz"', () => {
    const b = getEmailBrand('nativz');
    expect(b.brandName).toBe('Nativz');
    expect(b.accent).toBe('#00ADEF');
    expect(b.websiteUrl).toBe('https://nativz.io');
  });

  it('AC and Nativz brands have different accent + header colours', () => {
    const ac = getEmailBrand('anderson');
    const nz = getEmailBrand('nativz');
    expect(ac.accent).not.toBe(nz.accent);
    expect(ac.headerGradStart).not.toBe(nz.headerGradStart);
    expect(ac.tagline).not.toBe(nz.tagline);
    expect(ac.address).not.toBe(nz.address);
  });
});

describe('legacy alias parity', () => {
  // Older templates still reference bgDark/blue/etc. — buildBrand wires
  // them to the new tokens. If this drifts, every legacy template
  // suddenly renders in mismatched colours.
  it.each(['anderson', 'nativz'] as const)(
    '%s legacy aliases mirror the new tokens',
    (agency) => {
      const b = getEmailBrand(agency);
      expect(b.bgDark).toBe(b.pageBg);
      expect(b.bgCard).toBe(b.cardBg);
      expect(b.borderCard).toBe(b.border);
      expect(b.textFooter).toBe(b.textMuted);
      expect(b.blue).toBe(b.accent);
      expect(b.blueCta).toBe(b.accent);
      expect(b.blueHover).toBe(b.accentDark);
      expect(b.blueSurface).toBe(b.accentSurface);
    },
  );

  it('EMAIL_BRAND legacy export points at the Nativz brand', () => {
    expect(EMAIL_BRAND).toBe(getEmailBrand('nativz'));
  });

  it('AC_EMAIL_BRAND legacy export points at the AC brand', () => {
    expect(AC_EMAIL_BRAND).toBe(getEmailBrand('anderson'));
  });
});

describe('email logo url resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('nativzEmailLogoUrl returns the docs-repo default when env var is unset', () => {
    vi.stubEnv('EMAIL_NATIVZ_LOGO_URL', '');
    expect(nativzEmailLogoUrl()).toBe('https://docs.nativz.io/assets/nativz-logo-dark.png');
  });

  it('nativzEmailLogoUrl honours the env override when set', () => {
    vi.stubEnv('EMAIL_NATIVZ_LOGO_URL', 'https://cortex.nativz.io/email/logo.png');
    expect(nativzEmailLogoUrl()).toBe('https://cortex.nativz.io/email/logo.png');
  });

  it('nativzEmailLogoUrl trims whitespace around the env override', () => {
    vi.stubEnv('EMAIL_NATIVZ_LOGO_URL', '   https://cortex.nativz.io/email/logo.png  ');
    expect(nativzEmailLogoUrl()).toBe('https://cortex.nativz.io/email/logo.png');
  });

  it('nativzEmailLogoUrl falls back to default when env override is blank/whitespace', () => {
    vi.stubEnv('EMAIL_NATIVZ_LOGO_URL', '   ');
    expect(nativzEmailLogoUrl()).toBe('https://docs.nativz.io/assets/nativz-logo-dark.png');
  });

  it('acEmailLogoUrl returns the docs-repo default when env var is unset', () => {
    vi.stubEnv('EMAIL_AC_LOGO_URL', '');
    expect(acEmailLogoUrl()).toBe(
      'https://docs.andersoncollaborative.com/assets/ac-logo-dark.png',
    );
  });

  it('acEmailLogoUrl honours the env override when set', () => {
    vi.stubEnv('EMAIL_AC_LOGO_URL', 'https://cortex.nativz.io/email/ac-logo.png');
    expect(acEmailLogoUrl()).toBe('https://cortex.nativz.io/email/ac-logo.png');
  });
});

describe('getEmailLogoUrl', () => {
  beforeEach(() => {
    vi.stubEnv('EMAIL_NATIVZ_LOGO_URL', '');
    vi.stubEnv('EMAIL_AC_LOGO_URL', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('routes "anderson" to the AC logo', () => {
    expect(getEmailLogoUrl('anderson')).toBe(
      'https://docs.andersoncollaborative.com/assets/ac-logo-dark.png',
    );
  });

  it('routes "nativz" to the Nativz logo', () => {
    expect(getEmailLogoUrl('nativz')).toBe(
      'https://docs.nativz.io/assets/nativz-logo-dark.png',
    );
  });

  it('respects per-brand env overrides independently', () => {
    vi.stubEnv('EMAIL_NATIVZ_LOGO_URL', 'https://nz.example/logo.png');
    vi.stubEnv('EMAIL_AC_LOGO_URL', 'https://ac.example/logo.png');
    expect(getEmailLogoUrl('nativz')).toBe('https://nz.example/logo.png');
    expect(getEmailLogoUrl('anderson')).toBe('https://ac.example/logo.png');
  });
});
