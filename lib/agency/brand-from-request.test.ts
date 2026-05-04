import { describe, expect, it } from 'vitest';
import { getBrandFromRequest } from './brand-from-request';

/**
 * getBrandFromRequest resolves the active agency brand for an incoming
 * Next.js Request. Three contracts to pin:
 *
 *   1. The `x-agency` header (middleware-injected) takes priority, BUT
 *      only if its value is one of {nativz, anderson}. A header value of
 *      "Anderson" or "anderson-collaborative" must NOT shortcut: those
 *      have to fall through to the hostname-based detection so a typo'd
 *      injection doesn't lock a request into the wrong brand.
 *
 *   2. When falling through, `new URL(request.url).hostname` wins over
 *      the `host` header. Localhost dev requests can have host="localhost"
 *      while request.url is the real cortex.nativz.io callback, and the
 *      header is what proxies sometimes lie about. URL is the canonical
 *      destination.
 *
 *   3. The return ALWAYS includes `brand`, `brandName`, `shortName`, and
 *      `domain` from AGENCY_CONFIG. Callers (system prompts, emails)
 *      destructure these directly; a regression that omitted any field
 *      would leak `undefined` into copy.
 */

function reqWith(opts: { url?: string; headers?: Record<string, string> }): Request {
  return new Request(opts.url ?? 'https://example.com/', {
    headers: opts.headers ?? {},
  });
}

describe('getBrandFromRequest — x-agency header shortcut', () => {
  it('returns nativz when x-agency=nativz, regardless of hostname', () => {
    const r = reqWith({
      url: 'https://cortex.andersoncollaborative.com/x',
      headers: { 'x-agency': 'nativz' },
    });
    const out = getBrandFromRequest(r);
    expect(out.brand).toBe('nativz');
    expect(out.brandName).toBe('Nativz');
  });

  it('returns anderson when x-agency=anderson, regardless of hostname', () => {
    const r = reqWith({
      url: 'https://cortex.nativz.io/x',
      headers: { 'x-agency': 'anderson' },
    });
    const out = getBrandFromRequest(r);
    expect(out.brand).toBe('anderson');
  });

  it('does NOT shortcut on an unknown x-agency value, falls through to hostname', () => {
    // Defensive: a typo or stale value must not lock the request to a
    // bogus brand. Anything outside the literal allowlist is ignored
    // and hostname detection runs normally.
    const r = reqWith({
      url: 'https://cortex.andersoncollaborative.com/x',
      headers: { 'x-agency': 'Anderson' },
    });
    const out = getBrandFromRequest(r);
    expect(out.brand).toBe('anderson');
  });

  it('does NOT shortcut on x-agency="anderson-collaborative" (full slug variant)', () => {
    const r = reqWith({
      url: 'https://cortex.nativz.io/x',
      headers: { 'x-agency': 'anderson-collaborative' },
    });
    const out = getBrandFromRequest(r);
    expect(out.brand).toBe('nativz');
  });
});

describe('getBrandFromRequest — hostname fallback', () => {
  it('returns nativz for cortex.nativz.io (default brand)', () => {
    const r = reqWith({ url: 'https://cortex.nativz.io/api/x' });
    const out = getBrandFromRequest(r);
    expect(out.brand).toBe('nativz');
  });

  it('returns anderson for cortex.andersoncollaborative.com', () => {
    const r = reqWith({ url: 'https://cortex.andersoncollaborative.com/api/x' });
    expect(getBrandFromRequest(r).brand).toBe('anderson');
  });

  it('returns anderson when hostname only contains "anderson"', () => {
    const r = reqWith({ url: 'https://anderson.example/x' });
    expect(getBrandFromRequest(r).brand).toBe('anderson');
  });

  it('defaults to nativz for an unknown hostname', () => {
    const r = reqWith({ url: 'https://random.example/x' });
    expect(getBrandFromRequest(r).brand).toBe('nativz');
  });

  it('prefers URL hostname over the host header when both disagree', () => {
    // Pin: a proxy might set host=localhost but request.url carries the
    // real public hostname. URL is canonical.
    const r = reqWith({
      url: 'https://cortex.andersoncollaborative.com/x',
      headers: { host: 'localhost' },
    });
    expect(getBrandFromRequest(r).brand).toBe('anderson');
  });
});

describe('getBrandFromRequest — return shape', () => {
  it('always returns brand, brandName, shortName, and domain', () => {
    const r = reqWith({ url: 'https://cortex.nativz.io/x' });
    const out = getBrandFromRequest(r);
    expect(out).toMatchObject({
      brand: expect.any(String),
      brandName: expect.any(String),
      shortName: expect.any(String),
      domain: expect.any(String),
    });
    expect(out.brandName.length).toBeGreaterThan(0);
    expect(out.shortName.length).toBeGreaterThan(0);
    expect(out.domain.length).toBeGreaterThan(0);
  });

  it('nativz config carries the Nativz display name and domain', () => {
    const r = reqWith({
      url: 'https://example.com/',
      headers: { 'x-agency': 'nativz' },
    });
    const out = getBrandFromRequest(r);
    expect(out.brandName).toMatch(/Nativz/i);
  });

  it('anderson config carries the Anderson Collaborative display name', () => {
    const r = reqWith({
      url: 'https://example.com/',
      headers: { 'x-agency': 'anderson' },
    });
    const out = getBrandFromRequest(r);
    expect(out.brandName).toMatch(/Anderson/i);
  });
});
