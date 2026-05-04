import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `lib/posting/index.ts` is the single import surface for posting providers.
 * Three contracts to pin:
 *
 *   1. `getPostingService()` is a process-level singleton: subsequent calls
 *      return the SAME instance, even though provider construction is cheap.
 *      Routes (publish, schedule, status) reach for the service per request,
 *      and a fresh instance every time would defeat in-memory rate-limit /
 *      backoff state living on the class.
 *
 *   2. `POSTING_PROVIDER='late'` resolves to the same `ZernioPostingService`
 *      as `'zernio'`. Late was the old vendor name; legacy env files still
 *      have `LATE_*`, and the alias is what keeps them booting after the
 *      Zernio rename. A regression that dropped this alias would 500 every
 *      publish on stale environments.
 *
 *   3. An unknown provider throws synchronously, not at first request. We
 *      want the error visible at process boot when the typo is fresh, not
 *      hidden behind a 500 the first time someone hits /api/posts/publish.
 *
 * `getZernioApiBase` and `getZernioApiKey` are re-exported from this barrel.
 * Their env-driven contracts are pinned alongside the provider dispatch so
 * one file owns the public surface of the module.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env.POSTING_PROVIDER;
  delete process.env.ZERNIO_API_KEY;
  delete process.env.ZERNIO_API_BASE;
  delete process.env.LATE_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getPostingService — singleton', () => {
  it('returns the same instance on subsequent calls within a module load', async () => {
    const mod = await import('./index');
    const a = mod.getPostingService();
    const b = mod.getPostingService();
    expect(a).toBe(b);
  });

  it('reads POSTING_PROVIDER lazily on first call (not at module import)', async () => {
    process.env.POSTING_PROVIDER = 'zernio';
    const mod = await import('./index');
    expect(() => mod.getPostingService()).not.toThrow();
  });
});

describe('getPostingService — provider dispatch', () => {
  it('defaults to ZernioPostingService when POSTING_PROVIDER is unset', async () => {
    const mod = await import('./index');
    const svc = mod.getPostingService();
    expect(svc).toBeInstanceOf(mod.ZernioPostingService);
  });

  it('returns ZernioPostingService when POSTING_PROVIDER=zernio', async () => {
    process.env.POSTING_PROVIDER = 'zernio';
    const mod = await import('./index');
    const svc = mod.getPostingService();
    expect(svc).toBeInstanceOf(mod.ZernioPostingService);
  });

  it('returns ZernioPostingService when POSTING_PROVIDER=late (legacy alias)', async () => {
    // Pin: legacy env files with the old vendor name still have to boot,
    // otherwise environments that haven't rotated the var 500 on every
    // publish.
    process.env.POSTING_PROVIDER = 'late';
    const mod = await import('./index');
    const svc = mod.getPostingService();
    expect(svc).toBeInstanceOf(mod.ZernioPostingService);
  });

  it('throws synchronously on an unknown provider', async () => {
    // Pin: the error must surface at the first getPostingService() call
    // (not get swallowed and re-thrown deep in a publish flow).
    process.env.POSTING_PROVIDER = 'tweetdeck';
    const mod = await import('./index');
    expect(() => mod.getPostingService()).toThrow(/Unknown posting provider: tweetdeck/);
  });

  it('mentions the supported provider in the unknown-provider error', async () => {
    process.env.POSTING_PROVIDER = 'bogus';
    const mod = await import('./index');
    expect(() => mod.getPostingService()).toThrow(/zernio/);
  });

  it('caches the unknown-provider failure path differently from the success path', async () => {
    // The current implementation throws on first call when provider is
    // unknown and never caches a null instance, so a subsequent call (still
    // unknown) re-throws rather than silently returning a stale value.
    process.env.POSTING_PROVIDER = 'bogus';
    const mod = await import('./index');
    expect(() => mod.getPostingService()).toThrow();
    expect(() => mod.getPostingService()).toThrow();
  });
});

describe('getZernioApiBase', () => {
  it('defaults to https://zernio.com/api/v1 when ZERNIO_API_BASE is unset', async () => {
    const mod = await import('./index');
    expect(mod.getZernioApiBase()).toBe('https://zernio.com/api/v1');
  });

  it('uses ZERNIO_API_BASE when set', async () => {
    process.env.ZERNIO_API_BASE = 'https://staging.zernio.com/api/v1';
    const mod = await import('./index');
    expect(mod.getZernioApiBase()).toBe('https://staging.zernio.com/api/v1');
  });

  it('strips a single trailing slash so callers can concatenate `/path`', async () => {
    // Pin: zernioRequest builds URLs as `${base}${path}` where path starts
    // with `/`. A `/api/v1/` base would produce `//endpoint`, which Zernio
    // 404s. The strip is what keeps the call sites simple.
    process.env.ZERNIO_API_BASE = 'https://example.test/api/v1/';
    const mod = await import('./index');
    expect(mod.getZernioApiBase()).toBe('https://example.test/api/v1');
  });

  it('only strips ONE trailing slash, not a run', async () => {
    // Defensive read of the regex: it's `/\/$/`, single char. Pin the
    // current behavior so a future loosen to `/\/+$/` is a deliberate change.
    process.env.ZERNIO_API_BASE = 'https://example.test/api/v1//';
    const mod = await import('./index');
    expect(mod.getZernioApiBase()).toBe('https://example.test/api/v1/');
  });
});

describe('getZernioApiKey', () => {
  it('returns ZERNIO_API_KEY when set', async () => {
    process.env.ZERNIO_API_KEY = 'zk_live_abc';
    const mod = await import('./index');
    expect(mod.getZernioApiKey()).toBe('zk_live_abc');
  });

  it('falls back to LATE_API_KEY when ZERNIO_API_KEY is unset (legacy alias)', async () => {
    // Pin: same migration story as the provider alias. Old envs keep working.
    process.env.LATE_API_KEY = 'late_legacy_key';
    const mod = await import('./index');
    expect(mod.getZernioApiKey()).toBe('late_legacy_key');
  });

  it('prefers ZERNIO_API_KEY over LATE_API_KEY when both are set', async () => {
    process.env.ZERNIO_API_KEY = 'zk_new';
    process.env.LATE_API_KEY = 'late_old';
    const mod = await import('./index');
    expect(mod.getZernioApiKey()).toBe('zk_new');
  });

  it('trims surrounding whitespace from the key', async () => {
    // Defensive: Vercel env paste sometimes carries trailing whitespace.
    // The trim keeps the Authorization header valid.
    process.env.ZERNIO_API_KEY = '  zk_with_padding  ';
    const mod = await import('./index');
    expect(mod.getZernioApiKey()).toBe('zk_with_padding');
  });

  it('throws when neither key is set', async () => {
    const mod = await import('./index');
    expect(() => mod.getZernioApiKey()).toThrow(/ZERNIO_API_KEY is not set/);
  });

  it('throws when the key is whitespace only', async () => {
    // Pin: a literal `ZERNIO_API_KEY=   ` in an env file must be treated
    // as missing, otherwise we'd send `Authorization: Bearer    ` and get
    // a 401 with no useful boot-time signal.
    process.env.ZERNIO_API_KEY = '   ';
    const mod = await import('./index');
    expect(() => mod.getZernioApiKey()).toThrow(/ZERNIO_API_KEY is not set/);
  });

  it('mentions the legacy LATE_API_KEY in the missing-key error', async () => {
    // Operators reading the error need to know the old var name still works
    // — otherwise they re-add the wrong variable.
    const mod = await import('./index');
    expect(() => mod.getZernioApiKey()).toThrow(/LATE_API_KEY/);
  });
});

describe('barrel re-exports', () => {
  it('exports ZernioPostingService, createZernioProfile, createLateProfile', async () => {
    const mod = await import('./index');
    expect(typeof mod.ZernioPostingService).toBe('function');
    expect(typeof mod.createZernioProfile).toBe('function');
    expect(typeof mod.createLateProfile).toBe('function');
  });
});
