import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCortexAppUrl } from './cortex-url';

/**
 * getCortexAppUrl mints the Cortex origin a recipient should land on
 * when they click a link in a branded email. AC-themed email →
 * cortex.andersoncollaborative.com; Nativz-themed email →
 * cortex.nativz.io. Crossing the streams sends the recipient to the
 * wrong-themed portal — same blast radius as a wrong-brand template.
 *
 * Two contracts under test:
 *   1. Per-agency env overrides win when set (with whitespace
 *      trimmed), and a blank value falls through to the default.
 *   2. NEXT_PUBLIC_APP_URL is intentionally NOT consulted — the helper
 *      exists precisely because that single-value origin is brand-
 *      biased. Setting it must NOT affect the result.
 */

describe('getCortexAppUrl — production defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the AC production host for "anderson" with no override', () => {
    vi.stubEnv('CORTEX_ANDERSON_URL', '');
    expect(getCortexAppUrl('anderson')).toBe('https://cortex.andersoncollaborative.com');
  });

  it('returns the Nativz production host for "nativz" with no override', () => {
    vi.stubEnv('CORTEX_NATIVZ_URL', '');
    expect(getCortexAppUrl('nativz')).toBe('https://cortex.nativz.io');
  });
});

describe('getCortexAppUrl — env overrides', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('honours CORTEX_ANDERSON_URL for the anderson brand', () => {
    vi.stubEnv('CORTEX_ANDERSON_URL', 'https://staging-ac.example.com');
    expect(getCortexAppUrl('anderson')).toBe('https://staging-ac.example.com');
  });

  it('honours CORTEX_NATIVZ_URL for the nativz brand', () => {
    vi.stubEnv('CORTEX_NATIVZ_URL', 'https://staging-nz.example.com');
    expect(getCortexAppUrl('nativz')).toBe('https://staging-nz.example.com');
  });

  it('trims whitespace around the env override', () => {
    vi.stubEnv('CORTEX_ANDERSON_URL', '   https://ac.example.com   ');
    expect(getCortexAppUrl('anderson')).toBe('https://ac.example.com');
  });

  it('falls back to default when override is blank/whitespace', () => {
    vi.stubEnv('CORTEX_ANDERSON_URL', '   ');
    expect(getCortexAppUrl('anderson')).toBe('https://cortex.andersoncollaborative.com');
  });

  it('per-brand overrides are independent', () => {
    vi.stubEnv('CORTEX_ANDERSON_URL', 'https://ac.example.com');
    vi.stubEnv('CORTEX_NATIVZ_URL', 'https://nz.example.com');
    expect(getCortexAppUrl('anderson')).toBe('https://ac.example.com');
    expect(getCortexAppUrl('nativz')).toBe('https://nz.example.com');
  });

  it('setting only one override does not leak into the other brand', () => {
    vi.stubEnv('CORTEX_ANDERSON_URL', 'https://ac.example.com');
    vi.stubEnv('CORTEX_NATIVZ_URL', '');
    expect(getCortexAppUrl('nativz')).toBe('https://cortex.nativz.io');
  });
});

describe('getCortexAppUrl — NEXT_PUBLIC_APP_URL is intentionally ignored', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does NOT consult NEXT_PUBLIC_APP_URL for the anderson brand', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://cortex.nativz.io');
    vi.stubEnv('CORTEX_ANDERSON_URL', '');
    expect(getCortexAppUrl('anderson')).toBe('https://cortex.andersoncollaborative.com');
  });

  it('does NOT consult NEXT_PUBLIC_APP_URL for the nativz brand', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://cortex.andersoncollaborative.com');
    vi.stubEnv('CORTEX_NATIVZ_URL', '');
    expect(getCortexAppUrl('nativz')).toBe('https://cortex.nativz.io');
  });
});
