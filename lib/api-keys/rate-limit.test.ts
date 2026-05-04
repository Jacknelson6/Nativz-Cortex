import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `checkRateLimit` is the only thing standing between an API key and a flood
 * of public REST calls. Three contracts to pin:
 *
 *   1. Per-key isolation. The map keys on the API-key id, so one noisy
 *      key MUST NOT exhaust another key's quota. A regression that keyed
 *      on a shared bucket (or no key at all) would let a single client
 *      starve everyone else on the instance.
 *
 *   2. The 30/min ceiling is a hard ceiling within the window. The 30th
 *      request passes, the 31st is rejected, and rejection persists until
 *      the window rolls. A regression that compared `<` instead of `<=`
 *      would silently halve the effective limit.
 *
 *   3. The window is a fixed 60-second tumbler, not a sliding count. The
 *      first request after 60s gets a brand-new bucket of 30. A
 *      regression that left `resetAt` at the original timestamp would
 *      permanently reject keys after their first overage.
 *
 * The module owns a top-level Map and a setInterval cleanup timer, so each
 * test resets module state via `vi.resetModules()` and re-imports
 * checkRateLimit. Time is controlled with vi.useFakeTimers() so we don't
 * sleep through real seconds.
 */

let checkRateLimit: typeof import('./rate-limit').checkRateLimit;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  ({ checkRateLimit } = await import('./rate-limit'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkRateLimit — first request semantics', () => {
  it('allows the very first request for a key', () => {
    expect(checkRateLimit('key-a')).toBe(true);
  });

  it('returns true for a brand-new key even if other keys are saturated', () => {
    // Pin: per-key isolation. Saturate key-a, then a fresh key-b must
    // still get its own 30-request budget.
    for (let i = 0; i < 30; i++) checkRateLimit('key-a');
    expect(checkRateLimit('key-a')).toBe(false);
    expect(checkRateLimit('key-b')).toBe(true);
  });
});

describe('checkRateLimit — 30/min ceiling', () => {
  it('allows exactly 30 requests inside one window', () => {
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit('key-a'), `request ${i + 1} of 30 should be allowed`).toBe(true);
    }
  });

  it('rejects the 31st request inside the window', () => {
    for (let i = 0; i < 30; i++) checkRateLimit('key-a');
    expect(checkRateLimit('key-a')).toBe(false);
  });

  it('keeps rejecting subsequent requests inside the same window', () => {
    // Pin: rejection persists. A regression that flipped a flag and reset
    // the counter on overage would let request 32, 33, ... slip through.
    for (let i = 0; i < 30; i++) checkRateLimit('key-a');
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('key-a')).toBe(false);
    }
  });

  it('does not consume budget across keys when one is overspent', () => {
    for (let i = 0; i < 30; i++) checkRateLimit('key-a');
    expect(checkRateLimit('key-a')).toBe(false);
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit('key-b'), `key-b request ${i + 1}`).toBe(true);
    }
    expect(checkRateLimit('key-b')).toBe(false);
  });
});

describe('checkRateLimit — window rollover', () => {
  it('refills the budget for a key after the 60-second window', () => {
    // Pin: window is a fixed 60s tumbler. Once the clock crosses
    // resetAt, the key gets a fresh 30-request bucket.
    for (let i = 0; i < 30; i++) checkRateLimit('key-a');
    expect(checkRateLimit('key-a')).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit('key-a')).toBe(true);
  });

  it('does NOT refill at exactly 60s (window must be strictly past)', () => {
    // The check is `now > entry.resetAt`. resetAt = startedAt + 60_000.
    // At exactly resetAt the comparison is `>` not `>=`, so we still
    // count against the old window.
    for (let i = 0; i < 30; i++) checkRateLimit('key-a');
    expect(checkRateLimit('key-a')).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(checkRateLimit('key-a')).toBe(false);
  });

  it('does NOT refill mid-window', () => {
    for (let i = 0; i < 30; i++) checkRateLimit('key-a');
    vi.advanceTimersByTime(30_000);
    expect(checkRateLimit('key-a')).toBe(false);
  });

  it('grants a full 30-request bucket each rollover (not partial credit)', () => {
    // Defensive: a regression that partially decayed the counter would
    // let only N requests through after rollover. The implementation
    // resets to count:1, so 29 more should still pass.
    for (let i = 0; i < 30; i++) checkRateLimit('key-a');
    vi.advanceTimersByTime(60_001);
    // First request after rollover already counted as 1. 29 more allowed.
    expect(checkRateLimit('key-a')).toBe(true);
    for (let i = 0; i < 29; i++) {
      expect(checkRateLimit('key-a'), `post-rollover request ${i + 2}`).toBe(true);
    }
    expect(checkRateLimit('key-a')).toBe(false);
  });

  it('resets independently per key (window starts on first call, not globally)', () => {
    // key-a starts at t=0, key-b starts at t=30s. Each gets its own
    // 60s window; saturate both; advance 31s; key-a should refill,
    // key-b should still be locked out.
    for (let i = 0; i < 30; i++) checkRateLimit('key-a');
    vi.advanceTimersByTime(30_000);
    for (let i = 0; i < 30; i++) checkRateLimit('key-b');
    expect(checkRateLimit('key-a')).toBe(false);
    expect(checkRateLimit('key-b')).toBe(false);
    vi.advanceTimersByTime(31_000);
    expect(checkRateLimit('key-a')).toBe(true);
    expect(checkRateLimit('key-b')).toBe(false);
  });
});

describe('checkRateLimit — input handling', () => {
  it('treats different key strings as different buckets', () => {
    expect(checkRateLimit('aaa')).toBe(true);
    expect(checkRateLimit('bbb')).toBe(true);
    expect(checkRateLimit('aaa-vs-bbb')).toBe(true);
  });

  it('treats empty string as its own (valid) bucket', () => {
    // Defensive: validate.ts always passes a non-empty key.id, but a
    // regression that defaulted to '' should still be tracked rather
    // than crash or silently bypass.
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit(''), `empty-string bucket request ${i + 1}`).toBe(true);
    }
    expect(checkRateLimit('')).toBe(false);
  });

  it('is case-sensitive on the key id', () => {
    // API key ids are UUIDs — case shouldn't be coalesced. A toLowerCase
    // regression would merge buckets we want kept apart.
    for (let i = 0; i < 30; i++) checkRateLimit('AbC');
    expect(checkRateLimit('AbC')).toBe(false);
    expect(checkRateLimit('abc')).toBe(true);
  });
});
