import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * `validateApiKey` is the gate every public REST route runs through. The
 * shape is: parse Authorization header → look up + verify the key row →
 * check expiry → check viewer-API allowance → check scope → check rate
 * limit → return ctx. Five contracts to pin:
 *
 *   1. Status code discipline. Missing/malformed Authorization → 401.
 *      Unknown or revoked key → 401. Expired key → 401. API access
 *      disabled for that user → 403. Missing scope → 403. Rate-limit
 *      exceeded → 429. A regression that conflated 401/403/429 would
 *      mislead client-side error handling and break the documented API
 *      surface.
 *
 *   2. Order matters. Auth-format check happens BEFORE the DB query (so
 *      a malformed token doesn't burn a Supabase round trip). Scope
 *      check happens BEFORE the rate-limit check (so a no-scope caller
 *      doesn't deplete the rate-limit budget). Pin both orderings via
 *      mock-call assertions.
 *
 *   3. Token format gate. Tokens must start with `ntvz_`. A regression
 *      that accepted any prefix would let attackers probe the hash table
 *      with arbitrary strings.
 *
 *   4. Scope path resolution. `/api/v1/posts/...` → 'scheduler' (rename),
 *      `/api/v1/clients/:id/knowledge` → 'knowledge' (nested), top-level
 *      `clients` resolves to 'clients'. An unknown top-level segment
 *      returns null and skips the scope check (so non-scoped routes
 *      pass through). A regression that hard-required a scope match
 *      would 403 every introspection endpoint.
 *
 *   5. last_used_at is updated fire-and-forget. The success path must
 *      NOT await the update before returning ctx — the route handler
 *      should not block on a write to log usage.
 */

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/portal/viewer-api-access', () => ({
  viewerMayUseRestApi: vi.fn(),
}));
vi.mock('./generate', () => ({
  hashApiKey: vi.fn((token: string) => `hashed:${token}`),
}));
vi.mock('./rate-limit', () => ({
  checkRateLimit: vi.fn(),
}));

import { validateApiKey } from './validate';
import { createAdminClient } from '@/lib/supabase/admin';
import { viewerMayUseRestApi } from '@/lib/portal/viewer-api-access';
import { hashApiKey } from './generate';
import { checkRateLimit } from './rate-limit';

interface KeyRow {
  id: string;
  user_id: string;
  scopes: string[];
  expires_at: string | null;
}

function setup(opts: {
  keyRow: KeyRow | null;
  apiAccessOk?: boolean;
  rateLimitOk?: boolean;
}) {
  const single = vi.fn().mockResolvedValue({ data: opts.keyRow });
  const eqIsActive = vi.fn().mockReturnValue({ single });
  const eqKeyHash = vi.fn().mockReturnValue({ eq: eqIsActive });
  const select = vi.fn().mockReturnValue({ eq: eqKeyHash });

  const updateEq = vi.fn().mockResolvedValue({ data: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  const from = vi.fn((table: string) => {
    if (table !== 'api_keys') throw new Error(`unexpected table: ${table}`);
    // The function calls .from('api_keys').select(...)... AND
    // .from('api_keys').update(...).eq(...) on the success path.
    // Distinguish by which method was invoked first.
    return {
      select,
      update,
    };
  });

  const adminClient = { from };
  vi.mocked(createAdminClient).mockReturnValue(
    adminClient as unknown as ReturnType<typeof createAdminClient>,
  );
  vi.mocked(viewerMayUseRestApi).mockResolvedValue(opts.apiAccessOk ?? true);
  vi.mocked(checkRateLimit).mockReturnValue(opts.rateLimitOk ?? true);

  return { from, select, eqKeyHash, eqIsActive, single, update, updateEq };
}

function buildRequest(opts: { authHeader?: string; pathname?: string }) {
  const url = `http://localhost:3001${opts.pathname ?? '/api/v1/tasks'}`;
  return new NextRequest(url, {
    headers: opts.authHeader ? { authorization: opts.authHeader } : {},
  });
}

async function statusOf(
  result: Awaited<ReturnType<typeof validateApiKey>>,
): Promise<number | null> {
  if ('error' in result) return result.error.status;
  return null;
}

async function bodyOf(
  result: Awaited<ReturnType<typeof validateApiKey>>,
): Promise<Record<string, unknown> | null> {
  if ('error' in result) return result.error.json();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('validateApiKey — Authorization header gate', () => {
  it('returns 401 when the Authorization header is missing entirely', async () => {
    setup({ keyRow: null });
    const result = await validateApiKey(buildRequest({}));
    expect(await statusOf(result)).toBe(401);
    expect(await bodyOf(result)).toEqual({ error: 'Missing Authorization header' });
  });

  it('returns 401 when the header is present but not Bearer', async () => {
    setup({ keyRow: null });
    const result = await validateApiKey(
      buildRequest({ authHeader: 'Basic dXNlcjpwYXNz' }),
    );
    expect(await statusOf(result)).toBe(401);
  });

  it('does NOT touch supabase or hashApiKey when auth header is missing', async () => {
    // Pin: ordering — bail before any DB work.
    const { from } = setup({ keyRow: null });
    await validateApiKey(buildRequest({}));
    expect(from).not.toHaveBeenCalled();
    expect(hashApiKey).not.toHaveBeenCalled();
  });
});

describe('validateApiKey — token format gate', () => {
  it('returns 401 for a Bearer token that does not start with ntvz_', async () => {
    setup({ keyRow: null });
    const result = await validateApiKey(
      buildRequest({ authHeader: 'Bearer sk-totally-fake' }),
    );
    expect(await statusOf(result)).toBe(401);
    expect(await bodyOf(result)).toEqual({ error: 'Invalid API key format' });
  });

  it('does NOT hash or query the DB for malformed tokens', async () => {
    // Pin: ordering — format check before DB work.
    const { from } = setup({ keyRow: null });
    await validateApiKey(buildRequest({ authHeader: 'Bearer wrong-prefix' }));
    expect(hashApiKey).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('accepts tokens that start with ntvz_ and proceeds to lookup', async () => {
    const { from } = setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['tasks'], expires_at: null },
    });
    await validateApiKey(buildRequest({ authHeader: 'Bearer ntvz_abc123' }));
    expect(hashApiKey).toHaveBeenCalledWith('ntvz_abc123');
    expect(from).toHaveBeenCalledWith('api_keys');
  });
});

describe('validateApiKey — DB lookup', () => {
  it('returns 401 when the key hash has no matching active row', async () => {
    setup({ keyRow: null });
    const result = await validateApiKey(
      buildRequest({ authHeader: 'Bearer ntvz_unknown' }),
    );
    expect(await statusOf(result)).toBe(401);
    expect(await bodyOf(result)).toEqual({ error: 'Invalid or revoked API key' });
  });

  it('queries by key_hash and is_active=true (revoked keys are excluded)', async () => {
    // Pin: revocation is is_active=false, not row deletion. The .eq()
    // chain MUST include is_active=true or revoked keys would still
    // authenticate.
    const { eqKeyHash, eqIsActive } = setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['tasks'], expires_at: null },
    });
    await validateApiKey(buildRequest({ authHeader: 'Bearer ntvz_real' }));
    expect(eqKeyHash).toHaveBeenCalledWith('key_hash', 'hashed:ntvz_real');
    expect(eqIsActive).toHaveBeenCalledWith('is_active', true);
  });

  it('selects only the columns it actually uses (no SELECT *)', async () => {
    const { select } = setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['tasks'], expires_at: null },
    });
    await validateApiKey(buildRequest({ authHeader: 'Bearer ntvz_real' }));
    expect(select).toHaveBeenCalledWith('id, user_id, scopes, expires_at');
  });
});

describe('validateApiKey — expiry', () => {
  it('returns 401 when expires_at is in the past', async () => {
    setup({
      keyRow: {
        id: 'k1',
        user_id: 'u1',
        scopes: ['tasks'],
        expires_at: '2020-01-01T00:00:00Z',
      },
    });
    const result = await validateApiKey(
      buildRequest({ authHeader: 'Bearer ntvz_real' }),
    );
    expect(await statusOf(result)).toBe(401);
    expect(await bodyOf(result)).toEqual({ error: 'API key expired' });
  });

  it('treats null expires_at as never-expires', async () => {
    // Pin: long-lived keys are stored with expires_at NULL. A regression
    // that compared `null < Date.now()` (truthy via NaN coercion) would
    // 401 every long-lived key.
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['tasks'], expires_at: null },
    });
    const result = await validateApiKey(
      buildRequest({ authHeader: 'Bearer ntvz_real' }),
    );
    expect('ctx' in result).toBe(true);
  });

  it('treats a future expires_at as not expired', async () => {
    setup({
      keyRow: {
        id: 'k1',
        user_id: 'u1',
        scopes: ['tasks'],
        expires_at: '2099-01-01T00:00:00Z',
      },
    });
    const result = await validateApiKey(
      buildRequest({ authHeader: 'Bearer ntvz_real' }),
    );
    expect('ctx' in result).toBe(true);
  });
});

describe('validateApiKey — viewer API access', () => {
  it('returns 403 when viewerMayUseRestApi resolves false', async () => {
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['tasks'], expires_at: null },
      apiAccessOk: false,
    });
    const result = await validateApiKey(
      buildRequest({ authHeader: 'Bearer ntvz_real' }),
    );
    expect(await statusOf(result)).toBe(403);
    expect(await bodyOf(result)).toEqual({
      error: 'API access is disabled for this account',
    });
  });

  it('passes the user_id from the row (not from the request) into viewerMayUseRestApi', async () => {
    // Pin: viewer-access is checked against the OWNER of the key, not
    // the requester. They're the same in practice, but the contract
    // should follow the row's user_id.
    setup({
      keyRow: { id: 'k1', user_id: 'owner-uid', scopes: ['tasks'], expires_at: null },
    });
    await validateApiKey(buildRequest({ authHeader: 'Bearer ntvz_real' }));
    expect(viewerMayUseRestApi).toHaveBeenCalledWith('owner-uid');
  });
});

describe('validateApiKey — scope check', () => {
  it('returns 403 when path requires a scope the key lacks', async () => {
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['clients'], expires_at: null },
    });
    const result = await validateApiKey(
      buildRequest({
        authHeader: 'Bearer ntvz_real',
        pathname: '/api/v1/tasks/some-id',
      }),
    );
    expect(await statusOf(result)).toBe(403);
    expect(await bodyOf(result)).toEqual({ error: 'Missing scope: tasks' });
  });

  it('grants when the path scope is present in the key.scopes array', async () => {
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['tasks', 'clients'], expires_at: null },
    });
    const result = await validateApiKey(
      buildRequest({
        authHeader: 'Bearer ntvz_real',
        pathname: '/api/v1/tasks/123',
      }),
    );
    expect('ctx' in result).toBe(true);
  });

  it('maps /api/v1/posts/... to the "scheduler" scope (legacy path rename)', async () => {
    // Pin: SCOPE_MAP renames `posts` → `scheduler` because the
    // underlying scope is the scheduler permission. A regression to
    // a 1:1 mapping would 403 every legitimate /posts call.
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['scheduler'], expires_at: null },
    });
    const result = await validateApiKey(
      buildRequest({
        authHeader: 'Bearer ntvz_real',
        pathname: '/api/v1/posts/abc',
      }),
    );
    expect('ctx' in result).toBe(true);
  });

  it('does NOT grant /api/v1/posts when the key has only the literal "posts" scope', async () => {
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['posts'], expires_at: null },
    });
    const result = await validateApiKey(
      buildRequest({
        authHeader: 'Bearer ntvz_real',
        pathname: '/api/v1/posts/abc',
      }),
    );
    expect(await statusOf(result)).toBe(403);
    expect(await bodyOf(result)).toEqual({ error: 'Missing scope: scheduler' });
  });

  it('treats /api/v1/clients/:id/knowledge as the "knowledge" scope (nested resource)', async () => {
    // Pin: nested-resource scope resolution. A key with only `clients`
    // scope must NOT pass through to a /knowledge subroute.
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['clients'], expires_at: null },
    });
    const result = await validateApiKey(
      buildRequest({
        authHeader: 'Bearer ntvz_real',
        pathname: '/api/v1/clients/abc-123/knowledge',
      }),
    );
    expect(await statusOf(result)).toBe(403);
    expect(await bodyOf(result)).toEqual({ error: 'Missing scope: knowledge' });
  });

  it('grants /api/v1/clients/:id (top-level "clients" scope) when key has clients', async () => {
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['clients'], expires_at: null },
    });
    const result = await validateApiKey(
      buildRequest({
        authHeader: 'Bearer ntvz_real',
        pathname: '/api/v1/clients/abc-123',
      }),
    );
    expect('ctx' in result).toBe(true);
  });

  it('passes through (no scope check) when the path resolves to no known scope', async () => {
    // Pin: an unknown top-level segment returns null from
    // getScopeFromPath, which short-circuits the scope gate. This is
    // load-bearing for introspection and unprefixed admin endpoints.
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: [], expires_at: null },
    });
    const result = await validateApiKey(
      buildRequest({
        authHeader: 'Bearer ntvz_real',
        pathname: '/api/v1/whoami',
      }),
    );
    expect('ctx' in result).toBe(true);
  });
});

describe('validateApiKey — rate limit', () => {
  it('returns 429 when checkRateLimit returns false', async () => {
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['tasks'], expires_at: null },
      rateLimitOk: false,
    });
    const result = await validateApiKey(
      buildRequest({
        authHeader: 'Bearer ntvz_real',
        pathname: '/api/v1/tasks',
      }),
    );
    expect(await statusOf(result)).toBe(429);
    expect(await bodyOf(result)).toEqual({
      error: 'Rate limit exceeded (30/min per instance)',
    });
  });

  it('keys the rate limiter on the api_keys.id (not the user_id)', async () => {
    // Pin: per-key rate limiting. A regression that keyed on user_id
    // would let one user's keys cannibalize each other's budget.
    setup({
      keyRow: { id: 'key-id-x', user_id: 'user-y', scopes: ['tasks'], expires_at: null },
    });
    await validateApiKey(buildRequest({ authHeader: 'Bearer ntvz_real' }));
    expect(checkRateLimit).toHaveBeenCalledWith('key-id-x');
  });

  it('does NOT consult the rate limiter when the scope check fails first', async () => {
    // Pin: ordering — scope BEFORE rate-limit. A 403 caller must not
    // burn rate-limit budget; otherwise scoped scanners could DoS the
    // legitimate caller.
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: [], expires_at: null },
    });
    await validateApiKey(
      buildRequest({
        authHeader: 'Bearer ntvz_real',
        pathname: '/api/v1/tasks',
      }),
    );
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});

describe('validateApiKey — happy path return shape', () => {
  it('returns ctx with userId, keyId, and scopes from the row', async () => {
    setup({
      keyRow: {
        id: 'key-uuid',
        user_id: 'user-uuid',
        scopes: ['tasks', 'clients'],
        expires_at: null,
      },
    });
    const result = await validateApiKey(
      buildRequest({ authHeader: 'Bearer ntvz_real', pathname: '/api/v1/tasks' }),
    );
    if ('error' in result) throw new Error('expected ctx');
    expect(result.ctx.userId).toBe('user-uuid');
    expect(result.ctx.keyId).toBe('key-uuid');
    expect(result.ctx.scopes).toEqual(['tasks', 'clients']);
  });

  it('returns a plain object (NOT a NextResponse) on the success path', async () => {
    // Pin: route handlers branch on `'error' in result`. A regression
    // that returned a NextResponse on success would break that branch.
    setup({
      keyRow: { id: 'k1', user_id: 'u1', scopes: ['tasks'], expires_at: null },
    });
    const result = await validateApiKey(
      buildRequest({ authHeader: 'Bearer ntvz_real', pathname: '/api/v1/tasks' }),
    );
    expect(result).not.toBeInstanceOf(NextResponse);
    expect('ctx' in result).toBe(true);
  });

  it('issues the last_used_at update on success', async () => {
    // Pin: usage stamping. A regression that skipped the update would
    // make /admin/api-keys "Last used" column lie permanently.
    const { update } = setup({
      keyRow: { id: 'key-x', user_id: 'u', scopes: ['tasks'], expires_at: null },
    });
    await validateApiKey(
      buildRequest({ authHeader: 'Bearer ntvz_real', pathname: '/api/v1/tasks' }),
    );
    expect(update).toHaveBeenCalledTimes(1);
    const arg = (update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toHaveProperty('last_used_at');
    expect(typeof arg.last_used_at).toBe('string');
  });
});
