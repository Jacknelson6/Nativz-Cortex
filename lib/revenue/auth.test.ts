import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * `lib/revenue/auth.ts` is the gate for every revenue-hub admin route.
 * Three contracts to pin:
 *
 *   1. No authenticated session → 401, NOT 403. Stripe-related routes are
 *      hit by both UI and the platform poller; conflating "not signed in"
 *      with "signed in but lacking permission" makes incident triage harder
 *      and may surface the wrong client-side redirect.
 *
 *   2. Role check is an OR over THREE positive cases: `is_super_admin === true`
 *      OR `role === 'admin'` OR `role === 'super_admin'`. The boolean column
 *      was added later than the role string; both still gate access. A
 *      regression that dropped any of the three would lock real admins out
 *      of revenue tools.
 *
 *   3. Anything outside the allowlist → 403. Includes 'viewer' (portal
 *      users), null role, missing user row. Forgetting to filter 'viewer'
 *      explicitly would expose every client's MRR through the revenue
 *      detector queries.
 *
 * Both supabase clients are mocked at the module boundary so the test
 * doesn't touch the real auth or DB. requireAdmin reaches for the user
 * via `auth.getUser()` and the role row via `from('users').select(...)`.
 */

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { requireAdmin } from './auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type UserRow = { role?: string | null; is_super_admin?: boolean | null } | null;

function setup(opts: { user: { id: string } | null; row: UserRow }) {
  const single = vi.fn().mockResolvedValue({ data: opts.row });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const adminFrom = vi.fn().mockReturnValue({ select });
  const adminClient = { from: adminFrom };

  const getUser = vi.fn().mockResolvedValue({ data: { user: opts.user } });
  const serverClient = { auth: { getUser } };

  vi.mocked(createServerSupabaseClient).mockResolvedValue(
    serverClient as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>,
  );
  vi.mocked(createAdminClient).mockReturnValue(
    adminClient as unknown as ReturnType<typeof createAdminClient>,
  );

  return { adminFrom, select, eq, single };
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function statusOf(result: Awaited<ReturnType<typeof requireAdmin>>): Promise<number | null> {
  if (result instanceof NextResponse) return result.status;
  return null;
}

async function bodyOf(
  result: Awaited<ReturnType<typeof requireAdmin>>,
): Promise<Record<string, unknown> | null> {
  if (result instanceof NextResponse) return result.json();
  return null;
}

describe('requireAdmin — unauthenticated', () => {
  it('returns a 401 NextResponse when there is no user', async () => {
    setup({ user: null, row: null });
    const result = await requireAdmin();
    expect(await statusOf(result)).toBe(401);
  });

  it('uses the literal "Unauthorized" error string in the 401 body', async () => {
    setup({ user: null, row: null });
    const result = await requireAdmin();
    expect(await bodyOf(result)).toEqual({ error: 'Unauthorized' });
  });

  it('does NOT touch the admin client when there is no user', async () => {
    // Pin: short-circuit at auth check. We don't want to query the users
    // table for null IDs, which would hit RLS and 500 on some environments.
    const { adminFrom } = setup({ user: null, row: null });
    await requireAdmin();
    expect(adminFrom).not.toHaveBeenCalled();
  });
});

describe('requireAdmin — authorized roles', () => {
  it('grants access when role === "admin"', async () => {
    setup({ user: { id: 'u1' }, row: { role: 'admin', is_super_admin: false } });
    const result = await requireAdmin();
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.userId).toBe('u1');
    expect(result.admin).toBeDefined();
  });

  it('grants access when role === "super_admin"', async () => {
    setup({ user: { id: 'u2' }, row: { role: 'super_admin', is_super_admin: false } });
    const result = await requireAdmin();
    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('grants access when is_super_admin === true (regardless of role)', async () => {
    // Pin: the boolean column was added after the role string. Some real
    // super-admins have role='viewer' + is_super_admin=true and must still
    // pass the gate.
    setup({ user: { id: 'u3' }, row: { role: 'viewer', is_super_admin: true } });
    const result = await requireAdmin();
    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('grants access when is_super_admin === true and role is null', async () => {
    setup({ user: { id: 'u4' }, row: { role: null, is_super_admin: true } });
    const result = await requireAdmin();
    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('passes the userId from the auth user (not from the users row)', async () => {
    // Pin: the returned userId is `user.id` from auth.getUser, not the
    // joined users.id. They're the same in practice but the contract
    // matters: callers use userId for activity logs / created_by stamps,
    // and routing through the auth identity keeps the audit trail honest.
    setup({ user: { id: 'auth-uid-123' }, row: { role: 'admin' } });
    const result = await requireAdmin();
    if (result instanceof NextResponse) throw new Error('expected ok result');
    expect(result.userId).toBe('auth-uid-123');
  });
});

describe('requireAdmin — forbidden roles', () => {
  it('returns a 403 NextResponse for role === "viewer"', async () => {
    // Pin: this is the load-bearing case. Portal users hit revenue routes
    // through navigation accidents or stale tabs; they MUST be 403'd, not
    // pass through to the data layer.
    setup({ user: { id: 'u' }, row: { role: 'viewer', is_super_admin: false } });
    const result = await requireAdmin();
    expect(await statusOf(result)).toBe(403);
  });

  it('returns 403 for an unknown role', async () => {
    setup({ user: { id: 'u' }, row: { role: 'editor', is_super_admin: false } });
    expect(await statusOf(await requireAdmin())).toBe(403);
  });

  it('returns 403 for a null users row (user signed in but not in users table)', async () => {
    // Defensive: should never happen in prod, but a regression that
    // returned ok on null would hand admin access to anyone with a
    // valid session token.
    setup({ user: { id: 'u' }, row: null });
    expect(await statusOf(await requireAdmin())).toBe(403);
  });

  it('returns 403 with literal "Forbidden" body', async () => {
    setup({ user: { id: 'u' }, row: { role: 'viewer' } });
    const result = await requireAdmin();
    expect(await bodyOf(result)).toEqual({ error: 'Forbidden' });
  });

  it('treats is_super_admin=null as falsy (does not satisfy the OR)', async () => {
    // Pin: only `=== true` satisfies the boolean check. The migration
    // backfill set most users to false but some legacy rows might be null
    // — those must not slip through.
    setup({ user: { id: 'u' }, row: { role: 'viewer', is_super_admin: null } });
    expect(await statusOf(await requireAdmin())).toBe(403);
  });

  it('treats is_super_admin=undefined as falsy', async () => {
    setup({ user: { id: 'u' }, row: { role: 'viewer' } });
    expect(await statusOf(await requireAdmin())).toBe(403);
  });
});

describe('requireAdmin — query shape', () => {
  it('queries the users table by the auth user id', async () => {
    const { adminFrom, select, eq } = setup({
      user: { id: 'auth-uid' },
      row: { role: 'admin' },
    });
    await requireAdmin();
    expect(adminFrom).toHaveBeenCalledWith('users');
    expect(select).toHaveBeenCalledWith('role, is_super_admin');
    expect(eq).toHaveBeenCalledWith('id', 'auth-uid');
  });

  it('uses .single() so a missing row resolves to data:null rather than data:[]', async () => {
    const { single } = setup({ user: { id: 'u' }, row: null });
    await requireAdmin();
    expect(single).toHaveBeenCalled();
  });
});
