import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: fromMock,
  })),
}));

import { getOnboardingAdminContext } from './admin-auth';

/**
 * getOnboardingAdminContext gates every /api/admin/onboardings/* route.
 * Its contract has to stay byte-identical with lib/credits/admin-auth so
 * a user who can hit the credits admin surface can also drive
 * onboarding workflows, and vice versa. The cases below pin:
 *
 *   1. Auth failures (no user, auth error, error-with-user) all return
 *      401 — never 403, never silently grant.
 *   2. The role check is exactly is_super_admin === true OR
 *      role === 'admin' OR role === 'super_admin'. A viewer with
 *      is_super_admin: true is admin (Jack); an admin with
 *      is_super_admin: false is admin; a viewer with no flag is not.
 *   3. The lookup hits users.{role, is_super_admin} keyed on the
 *      authenticated user id — no extra PII, no wrong table.
 */

interface UserRow {
  role?: string | null;
  is_super_admin?: boolean | null;
}

function configureLookup(userRow: UserRow | null): {
  selectCall: ReturnType<typeof vi.fn>;
  eqCall: ReturnType<typeof vi.fn>;
} {
  const single = vi.fn(async () => ({ data: userRow, error: null }));
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  fromMock.mockImplementation((table: string) => {
    expect(table).toBe('users');
    return { select };
  });
  return { selectCall: select, eqCall: eq };
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe('getOnboardingAdminContext — auth failures', () => {
  it('returns 401 when there is no authenticated user', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const result = await getOnboardingAdminContext();
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns 401 when getUser surfaces an auth error', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('jwt expired'),
    });
    const result = await getOnboardingAdminContext();
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('returns 401 when authError is set even though user object exists', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: new Error('Token revoked'),
    });
    const result = await getOnboardingAdminContext();
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });
});

describe('getOnboardingAdminContext — role gate', () => {
  it('returns 403 when the users row is missing entirely', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: null,
    });
    configureLookup(null);
    const result = await getOnboardingAdminContext();
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'Admin access required',
    });
  });

  it('returns 403 for role: viewer with no super-admin flag', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: null,
    });
    configureLookup({ role: 'viewer', is_super_admin: null });
    const result = await getOnboardingAdminContext();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('returns 403 for an unknown role with no super-admin flag', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: null,
    });
    configureLookup({ role: 'editor', is_super_admin: false });
    const result = await getOnboardingAdminContext();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('returns ok for role: admin', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: null,
    });
    configureLookup({ role: 'admin', is_super_admin: false });
    const result = await getOnboardingAdminContext();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.user.id).toBe('u1');
      expect(result.ctx.admin).toBeDefined();
    }
  });

  it('returns ok for role: super_admin', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u2' } },
      error: null,
    });
    configureLookup({ role: 'super_admin', is_super_admin: false });
    const result = await getOnboardingAdminContext();
    expect(result.ok).toBe(true);
  });

  it('returns ok when is_super_admin is true even with role: viewer (Jack case)', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'jack' } },
      error: null,
    });
    configureLookup({ role: 'viewer', is_super_admin: true });
    const result = await getOnboardingAdminContext();
    expect(result.ok).toBe(true);
  });

  it('returns ok when is_super_admin is true even with role: null', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'jack' } },
      error: null,
    });
    configureLookup({ role: null, is_super_admin: true });
    const result = await getOnboardingAdminContext();
    expect(result.ok).toBe(true);
  });
});

describe('getOnboardingAdminContext — query shape', () => {
  it('queries the users table keyed on the resolved user id', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'lookup-id-42' } },
      error: null,
    });
    const { eqCall } = configureLookup({ role: 'admin' });
    await getOnboardingAdminContext();
    expect(eqCall).toHaveBeenCalledWith('id', 'lookup-id-42');
  });

  it('selects only the role + is_super_admin columns it needs', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: null,
    });
    const { selectCall } = configureLookup({ role: 'admin' });
    await getOnboardingAdminContext();
    expect(selectCall).toHaveBeenCalledWith('role, is_super_admin');
  });

  it('returns the same admin client instance in ctx that it used for the lookup', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: null,
    });
    configureLookup({ role: 'admin' });
    const result = await getOnboardingAdminContext();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.admin.from).toBe(fromMock);
    }
  });
});
