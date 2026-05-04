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
 *      - 'nativz' default for null, undefined, empty, or unknown
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
  it('returns "nativz" for null', () => {
    expect(getBrandFromAgency(null)).toBe('nativz');
  });

  it('returns "nativz" for undefined', () => {
    expect(getBrandFromAgency(undefined)).toBe('nativz');
  });

  it('returns "nativz" for empty string', () => {
    expect(getBrandFromAgency('')).toBe('nativz');
  });

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

  it('returns "nativz" for unknown agency names', () => {
    expect(getBrandFromAgency('nativz')).toBe('nativz');
    expect(getBrandFromAgency('mystery-shop')).toBe('nativz');
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
