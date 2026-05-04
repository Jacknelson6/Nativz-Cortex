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

import { getCreditsAdminContext } from './admin-auth';

interface UserRow {
  role?: string | null;
  is_super_admin?: boolean | null;
}

function configureLookup(userRow: UserRow | null): {
  fromCall: ReturnType<typeof vi.fn>;
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
  return { fromCall: fromMock, selectCall: select, eqCall: eq };
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe('getCreditsAdminContext', () => {
  it('returns 401 when there is no authenticated user', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const result = await getCreditsAdminContext();
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns 401 when getUser surfaces an auth error', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('jwt expired'),
    });
    const result = await getCreditsAdminContext();
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('returns 401 when authError is set even though user object exists', async () => {
    // Defensive: trust the error flag over the user payload.
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: new Error('Token revoked'),
    });
    const result = await getCreditsAdminContext();
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('returns 403 when the users row is missing entirely', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: null,
    });
    configureLookup(null);
    const result = await getCreditsAdminContext();
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'Admin access required',
    });
  });

  it('returns 403 when role is viewer and is_super_admin is null', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: null,
    });
    configureLookup({ role: 'viewer', is_super_admin: null });
    const result = await getCreditsAdminContext();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('returns ok when role is admin', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: null,
    });
    configureLookup({ role: 'admin', is_super_admin: false });
    const result = await getCreditsAdminContext();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.user.id).toBe('u1');
      expect(result.ctx.isAdmin).toBe(true);
      expect(result.ctx.admin).toBeDefined();
    }
  });

  it('returns ok when role is super_admin', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u2' } },
      error: null,
    });
    configureLookup({ role: 'super_admin', is_super_admin: false });
    const result = await getCreditsAdminContext();
    expect(result.ok).toBe(true);
  });

  it('returns ok when is_super_admin is true even with a non-admin role', async () => {
    // Real-world case: users with role=viewer can still be flagged super-admin.
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'jack' } },
      error: null,
    });
    configureLookup({ role: 'viewer', is_super_admin: true });
    const result = await getCreditsAdminContext();
    expect(result.ok).toBe(true);
  });

  it('queries the users table by the resolved user id', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'lookup-id-42' } },
      error: null,
    });
    const { eqCall } = configureLookup({ role: 'admin' });
    await getCreditsAdminContext();
    expect(eqCall).toHaveBeenCalledWith('id', 'lookup-id-42');
  });

  it('selects only the role + is_super_admin columns it needs', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: 'u1' } },
      error: null,
    });
    const { selectCall } = configureLookup({ role: 'admin' });
    await getCreditsAdminContext();
    expect(selectCall).toHaveBeenCalledWith('role, is_super_admin');
  });
});
