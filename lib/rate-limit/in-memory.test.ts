import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit, ipFromRequest } from './in-memory';

/**
 * checkRateLimit is the in-process advisory throttle behind public-signup
 * endpoints. The contract callers depend on:
 *
 *   - First request for a given key returns ok with remaining = limit-1
 *   - Subsequent requests within the same window decrement remaining
 *   - The (limit+1)th request returns ok:false with retryAfterSec >= 1
 *   - Once the window expires, the next request resets the bucket
 *   - resetAt is a stable absolute timestamp (not bumped on every call
 *     within a window — sliding-window key fact)
 *
 * Module-level state is in-process; tests use unique keys per case so
 * they don't bleed into each other, and fake timers so window-expiry
 * cases don't sleep.
 *
 * ipFromRequest extracts the originating IP, preferring x-forwarded-for
 * (first hop) over x-real-ip, falling back to 'unknown'. A regression
 * here would either lump every request behind a CDN under one IP (and
 * lock the world out together) or strip enough of the header that we
 * key on a stale ".trim()" of nothing.
 */

describe('checkRateLimit — first-hit + window accounting', () => {
  let now = 1_000_000_000_000;
  beforeEach(() => {
    now = 1_000_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('first request creates a bucket and returns remaining = limit-1', () => {
    const out = checkRateLimit('first:1', 5, 60_000);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.remaining).toBe(4);
      expect(out.resetAt).toBe(now + 60_000);
    }
  });

  it('decrements remaining on each call within the window', () => {
    const a = checkRateLimit('decr:1', 3, 60_000);
    const b = checkRateLimit('decr:1', 3, 60_000);
    const c = checkRateLimit('decr:1', 3, 60_000);
    expect(a.ok && a.remaining).toBe(2);
    expect(b.ok && b.remaining).toBe(1);
    expect(c.ok && c.remaining).toBe(0);
  });

  it('keeps resetAt stable across calls within the same window', () => {
    const a = checkRateLimit('stable:1', 5, 60_000);
    vi.setSystemTime(new Date(now + 5_000));
    const b = checkRateLimit('stable:1', 5, 60_000);
    expect(a.ok && b.ok && a.resetAt).toBe(b.ok ? b.resetAt : -1);
  });

  it('blocks the (limit+1)th request with retryAfterSec >= 1', () => {
    checkRateLimit('block:1', 2, 10_000);
    checkRateLimit('block:1', 2, 10_000);
    const out = checkRateLimit('block:1', 2, 10_000);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.retryAfterSec).toBeGreaterThanOrEqual(1);
      expect(out.retryAfterSec).toBeLessThanOrEqual(10);
    }
  });

  it('rounds retryAfterSec up so it never reports zero', () => {
    // 1ms remaining -> ceil(1/1000) = 1, not 0
    checkRateLimit('ceil:1', 1, 60_000);
    vi.setSystemTime(new Date(now + 59_999));
    const out = checkRateLimit('ceil:1', 1, 60_000);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.retryAfterSec).toBe(1);
    }
  });
});

describe('checkRateLimit — window expiry', () => {
  let now = 2_000_000_000_000;
  beforeEach(() => {
    now = 2_000_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets the bucket after the window passes', () => {
    checkRateLimit('reset:1', 1, 10_000);
    // Already at limit; next call within window blocks.
    const blocked = checkRateLimit('reset:1', 1, 10_000);
    expect(blocked.ok).toBe(false);
    // Step past the window.
    vi.setSystemTime(new Date(now + 10_001));
    const out = checkRateLimit('reset:1', 1, 10_000);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.remaining).toBe(0);
      expect(out.resetAt).toBe(now + 10_001 + 10_000);
    }
  });

  it('exactly at resetAt boundary: still treats the bucket as fresh', () => {
    checkRateLimit('edge:1', 1, 5_000);
    vi.setSystemTime(new Date(now + 5_000));
    const out = checkRateLimit('edge:1', 1, 5_000);
    expect(out.ok).toBe(true);
  });
});

describe('checkRateLimit — key isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(3_000_000_000_000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('different keys do not share buckets', () => {
    checkRateLimit('iso:a', 1, 60_000); // a -> at limit
    const fromA = checkRateLimit('iso:a', 1, 60_000);
    const fromB = checkRateLimit('iso:b', 1, 60_000);
    expect(fromA.ok).toBe(false);
    expect(fromB.ok).toBe(true);
  });
});

describe('ipFromRequest', () => {
  it('returns the first hop from x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' });
    expect(ipFromRequest(h)).toBe('203.0.113.5');
  });

  it('trims whitespace around the first hop', () => {
    const h = new Headers({ 'x-forwarded-for': '   203.0.113.5  ,  10.0.0.1' });
    expect(ipFromRequest(h)).toBe('203.0.113.5');
  });

  it('handles a single-value x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '198.51.100.7' });
    expect(ipFromRequest(h)).toBe('198.51.100.7');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const h = new Headers({ 'x-real-ip': '198.51.100.42' });
    expect(ipFromRequest(h)).toBe('198.51.100.42');
  });

  it('returns "unknown" when both headers are missing', () => {
    expect(ipFromRequest(new Headers())).toBe('unknown');
  });

  it('prefers x-forwarded-for over x-real-ip when both are present', () => {
    const h = new Headers({
      'x-forwarded-for': '203.0.113.5',
      'x-real-ip': '198.51.100.42',
    });
    expect(ipFromRequest(h)).toBe('203.0.113.5');
  });
});
