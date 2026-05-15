import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectAgencyFromHostname,
  getBrandFromAgency,
  resolveAgencyForRequest,
} from './detect';

/**
 * Agency detection runs on the request edge for every page render — it
 * decides which brand theme, logo, support email, and template variant
 * a user sees. A regression here means the wrong logo on the wrong
 * client portal, the wrong sender footer on every email, and so on.
 *
 * Three exports under test:
 *
 *   1. detectAgencyFromHostname(hostname)
 *      - 'anderson' when hostname contains an AC domain or alias
 *      - 'nativz' for every other host
 *      - case-insensitive (uppercase request hostnames must still match)
 *
 *   2. getBrandFromAgency(agencyColumn)
 *      - 'anderson' for 'anderson' / 'AC' / strings containing 'anderson'
 *      - 'nativz' for 'nativz' / 'NZ' / strings containing 'nativz'
 *      - Post-Victory incident hardening: throws in non-prod for null /
 *        undefined / empty / unknown values; logs and soft-falls to
 *        'nativz' in prod so a single bad row can't 500 a request.
 *        Migration 318 enforces NOT NULL + CHECK on clients.agency, so
 *        the null/unknown paths are defense-in-depth only.
 *
 *   3. resolveAgencyForRequest(request)
 *      - Honours `?brand=` query in non-prod (anderson | nativz only)
 *      - Honours `cortex_dev_brand` cookie in non-prod
 *      - Falls through to hostname detection in production
 */

describe('detectAgencyFromHostname', () => {
  it('returns "anderson" for the production AC subdomain', () => {
    expect(detectAgencyFromHostname('cortex.andersoncollaborative.com')).toBe('anderson');
  });

  it('returns "anderson" for the bare AC apex', () => {
    expect(detectAgencyFromHostname('andersoncollaborative.com')).toBe('anderson');
  });

  it('returns "anderson" for any host containing "anderson-collaborative"', () => {
    expect(detectAgencyFromHostname('preview-anderson-collaborative.vercel.app')).toBe(
      'anderson',
    );
  });

  it('returns "anderson" for any host containing "anderson"', () => {
    expect(detectAgencyFromHostname('anderson-staging.vercel.app')).toBe('anderson');
  });

  it('is case-insensitive', () => {
    expect(detectAgencyFromHostname('CORTEX.AndersonCollaborative.COM')).toBe('anderson');
  });

  it('returns "nativz" for the cortex.nativz.io production domain', () => {
    expect(detectAgencyFromHostname('cortex.nativz.io')).toBe('nativz');
  });

  it('returns "nativz" for unrelated hosts', () => {
    expect(detectAgencyFromHostname('localhost')).toBe('nativz');
    expect(detectAgencyFromHostname('example.com')).toBe('nativz');
    expect(detectAgencyFromHostname('preview.vercel.app')).toBe('nativz');
  });

  it('returns "nativz" for empty hostname', () => {
    expect(detectAgencyFromHostname('')).toBe('nativz');
  });
});

describe('getBrandFromAgency', () => {
  // Happy paths: a real agency value comes off clients.agency, the
  // function picks the right brand without complaint.
  it('returns "anderson" for the literal string "anderson"', () => {
    expect(getBrandFromAgency('anderson')).toBe('anderson');
  });

  it('returns "anderson" for the legacy two-letter "AC" code', () => {
    expect(getBrandFromAgency('AC')).toBe('anderson');
    expect(getBrandFromAgency('ac')).toBe('anderson');
  });

  it('returns "anderson" for any string containing "anderson"', () => {
    expect(getBrandFromAgency('Anderson Collaborative')).toBe('anderson');
    expect(getBrandFromAgency('Some Anderson Org')).toBe('anderson');
  });

  it('returns "nativz" for the literal string "nativz"', () => {
    expect(getBrandFromAgency('nativz')).toBe('nativz');
  });

  it('returns "nativz" for the legacy two-letter "NZ" code', () => {
    expect(getBrandFromAgency('NZ')).toBe('nativz');
    expect(getBrandFromAgency('nz')).toBe('nativz');
  });

  // Hard-fail paths: in non-prod (this test process) the function throws
  // so a missing agency tag surfaces loudly. The error message names the
  // function so log-grepping finds the violating call site.
  describe('null / unknown — hard fail in non-prod', () => {
    it('throws on null', () => {
      expect(() => getBrandFromAgency(null)).toThrow(/getBrandFromAgency/);
    });

    it('throws on undefined', () => {
      expect(() => getBrandFromAgency(undefined)).toThrow(/getBrandFromAgency/);
    });

    it('throws on empty string', () => {
      expect(() => getBrandFromAgency('')).toThrow(/getBrandFromAgency/);
    });

    it('throws on unknown agency names', () => {
      expect(() => getBrandFromAgency('mystery-shop')).toThrow(/unknown agency/);
    });
  });

  // Production soft fallback: same call, but with NODE_ENV=production
  // the function returns 'nativz' (with a console.error) so a single
  // bad row can't bring down a request path.
  describe('null / unknown — production soft fallback', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('returns "nativz" on null', () => {
      expect(getBrandFromAgency(null)).toBe('nativz');
    });

    it('returns "nativz" on unknown values', () => {
      expect(getBrandFromAgency('mystery-shop')).toBe('nativz');
    });

    it('logs the bad value via console.error', () => {
      getBrandFromAgency(null);
      expect(console.error).toHaveBeenCalled();
    });
  });
});

describe('resolveAgencyForRequest', () => {
  function makeRequest(opts: {
    hostname: string;
    query?: Record<string, string>;
    cookie?: string;
  }) {
    return {
      nextUrl: {
        hostname: opts.hostname,
        searchParams: new URLSearchParams(opts.query ?? {}),
      },
      cookies: {
        get: (name: string) =>
          name === 'cortex_dev_brand' && opts.cookie
            ? { value: opts.cookie }
            : undefined,
      },
    };
  }

  describe('production', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('ignores ?brand= query and uses hostname', () => {
      const req = makeRequest({
        hostname: 'cortex.nativz.io',
        query: { brand: 'anderson' },
      });
      expect(resolveAgencyForRequest(req)).toBe('nativz');
    });

    it('ignores cookie override and uses hostname', () => {
      const req = makeRequest({
        hostname: 'cortex.andersoncollaborative.com',
        cookie: 'nativz',
      });
      expect(resolveAgencyForRequest(req)).toBe('anderson');
    });
  });

  describe('non-production', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('honours ?brand=anderson on a nativz host', () => {
      const req = makeRequest({
        hostname: 'localhost',
        query: { brand: 'anderson' },
      });
      expect(resolveAgencyForRequest(req)).toBe('anderson');
    });

    it('honours ?brand=nativz on an anderson host', () => {
      const req = makeRequest({
        hostname: 'cortex.andersoncollaborative.com',
        query: { brand: 'nativz' },
      });
      expect(resolveAgencyForRequest(req)).toBe('nativz');
    });

    it('falls through invalid ?brand= values to cookie/hostname', () => {
      const req = makeRequest({
        hostname: 'localhost',
        query: { brand: 'mystery' },
        cookie: 'anderson',
      });
      expect(resolveAgencyForRequest(req)).toBe('anderson');
    });

    it('honours the cookie when no query param is set', () => {
      const req = makeRequest({ hostname: 'localhost', cookie: 'anderson' });
      expect(resolveAgencyForRequest(req)).toBe('anderson');
    });

    it('query overrides cookie when both are set', () => {
      const req = makeRequest({
        hostname: 'localhost',
        query: { brand: 'nativz' },
        cookie: 'anderson',
      });
      expect(resolveAgencyForRequest(req)).toBe('nativz');
    });

    it('falls through to hostname when neither query nor cookie applies', () => {
      const req = makeRequest({ hostname: 'cortex.andersoncollaborative.com' });
      expect(resolveAgencyForRequest(req)).toBe('anderson');
    });

    it('ignores invalid cookie values', () => {
      const req = makeRequest({ hostname: 'localhost', cookie: 'mystery' });
      expect(resolveAgencyForRequest(req)).toBe('nativz');
    });
  });
});
