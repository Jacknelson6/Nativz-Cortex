import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * viewer-api-access gates REST `/api/v1` Bearer-token usage. The rule is:
 *   - `admin` role: always allowed
 *   - `viewer` role: allowed only if EVERY client they can reach has
 *     `can_use_api !== false` in feature_flags
 *   - missing user row: denied
 *
 * The "every reachable client" set is computed via
 * `listViewerAccessibleClientFlags`, which itself has 3 modes:
 *   1. Has explicit `user_client_access` rows -> use those clients
 *   2. No access rows but has `users.organization_id` -> all active clients
 *      in that org
 *   3. Neither -> empty list
 *
 * Empty list under viewer role -> `viewerMayUseRestApi` returns false (a
 * viewer with no brands cannot use the REST API by default).
 */

interface UserRow {
  id: string;
  role: 'admin' | 'viewer' | 'super_admin' | null;
  organization_id: string | null;
}

interface AccessRow {
  user_id: string;
  client_id: string;
}

interface ClientRow {
  id: string;
  organization_id: string;
  is_active: boolean;
  feature_flags: unknown;
}

interface MockState {
  users: UserRow[];
  access: AccessRow[];
  clients: ClientRow[];
}

let state: MockState;

function makeAdmin() {
  return {
    from: (table: string) => {
      if (table === 'users') {
        const filters: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return builder;
          },
          single: async () => {
            const row = state.users.find((u) => u.id === filters.id);
            return { data: row ?? null, error: row ? null : { message: 'not found' } };
          },
        };
        return builder;
      }

      if (table === 'user_client_access') {
        const filters: Record<string, unknown> = {};
        const matches = () =>
          state.access.filter((a) =>
            Object.entries(filters).every(([k, v]) => (a as unknown as Record<string, unknown>)[k] === v),
          );
        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            // Eq is the terminal step here (no .single, no .limit).
            // Make it thenable so `await` resolves to the rows.
            return Object.assign(builder, {
              then: (resolve: (v: { data: AccessRow[]; error: null }) => unknown) =>
                resolve({ data: matches(), error: null }),
            });
          },
        };
        return builder;
      }

      if (table === 'clients') {
        const filters: Record<string, unknown> = {};
        let inFilter: { col: string; vals: unknown[] } | null = null;
        const matches = () =>
          state.clients.filter((c) => {
            const matchesEq = Object.entries(filters).every(
              ([k, v]) => (c as unknown as Record<string, unknown>)[k] === v,
            );
            if (!matchesEq) return false;
            if (inFilter) {
              return inFilter.vals.includes((c as unknown as Record<string, unknown>)[inFilter.col]);
            }
            return true;
          });
        const builder: Record<string, unknown> = {};
        Object.assign(builder, {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return Object.assign(builder, {
              then: (resolve: (v: { data: ClientRow[]; error: null }) => unknown) =>
                resolve({ data: matches(), error: null }),
            });
          },
          in: (col: string, vals: unknown[]) => {
            inFilter = { col, vals };
            return builder;
          },
        });
        return builder;
      }

      throw new Error(`unexpected table: ${table}`);
    },
  };
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => makeAdmin()),
}));

const { listViewerAccessibleClientFlags, viewerMayUseRestApi } = await import('./viewer-api-access');

beforeEach(() => {
  state = {
    users: [],
    access: [],
    clients: [],
  };
});

describe('listViewerAccessibleClientFlags', () => {
  it('returns [] when the user row is missing', async () => {
    expect(await listViewerAccessibleClientFlags('ghost')).toEqual([]);
  });

  it('returns [] for an admin (caller treats this as bypass)', async () => {
    state.users.push({ id: 'admin-1', role: 'admin', organization_id: null });
    expect(await listViewerAccessibleClientFlags('admin-1')).toEqual([]);
  });

  it('uses user_client_access when the viewer has explicit rows', async () => {
    state.users.push({ id: 'v', role: 'viewer', organization_id: null });
    state.access.push(
      { user_id: 'v', client_id: 'c-1' },
      { user_id: 'v', client_id: 'c-2' },
    );
    state.clients.push(
      { id: 'c-1', organization_id: 'o', is_active: true, feature_flags: { can_use_api: true } },
      { id: 'c-2', organization_id: 'o', is_active: true, feature_flags: { can_use_api: false } },
    );
    const flags = await listViewerAccessibleClientFlags('v');
    expect(flags).toHaveLength(2);
    expect(flags).toContainEqual({ can_use_api: true });
    expect(flags).toContainEqual({ can_use_api: false });
  });

  it('skips inactive clients in the access-rows path', async () => {
    state.users.push({ id: 'v', role: 'viewer', organization_id: null });
    state.access.push({ user_id: 'v', client_id: 'c-1' });
    state.clients.push({
      id: 'c-1', organization_id: 'o', is_active: false, feature_flags: { can_use_api: true },
    });
    expect(await listViewerAccessibleClientFlags('v')).toEqual([]);
  });

  it('falls back to organization_id when there are no access rows', async () => {
    state.users.push({ id: 'v', role: 'viewer', organization_id: 'org-legacy' });
    state.clients.push(
      { id: 'c-1', organization_id: 'org-legacy', is_active: true, feature_flags: { can_use_api: true } },
      { id: 'c-2', organization_id: 'org-legacy', is_active: true, feature_flags: {} },
      { id: 'c-3', organization_id: 'other-org', is_active: true, feature_flags: { can_use_api: true } },
    );
    const flags = await listViewerAccessibleClientFlags('v');
    expect(flags).toHaveLength(2);
  });

  it('returns [] when the viewer has neither access rows nor an organization_id', async () => {
    state.users.push({ id: 'v', role: 'viewer', organization_id: null });
    expect(await listViewerAccessibleClientFlags('v')).toEqual([]);
  });

  it('skips inactive clients in the legacy-org path', async () => {
    state.users.push({ id: 'v', role: 'viewer', organization_id: 'o' });
    state.clients.push({
      id: 'c-1', organization_id: 'o', is_active: false, feature_flags: { can_use_api: true },
    });
    expect(await listViewerAccessibleClientFlags('v')).toEqual([]);
  });
});

describe('viewerMayUseRestApi', () => {
  it('returns false when the user row is missing', async () => {
    expect(await viewerMayUseRestApi('ghost')).toBe(false);
  });

  it('returns true unconditionally for admin role', async () => {
    state.users.push({ id: 'admin-1', role: 'admin', organization_id: null });
    expect(await viewerMayUseRestApi('admin-1')).toBe(true);
  });

  it('returns true for a viewer when every accessible client has can_use_api !== false', async () => {
    state.users.push({ id: 'v', role: 'viewer', organization_id: null });
    state.access.push(
      { user_id: 'v', client_id: 'c-1' },
      { user_id: 'v', client_id: 'c-2' },
    );
    state.clients.push(
      { id: 'c-1', organization_id: 'o', is_active: true, feature_flags: { can_use_api: true } },
      { id: 'c-2', organization_id: 'o', is_active: true, feature_flags: { can_use_api: true } },
    );
    expect(await viewerMayUseRestApi('v')).toBe(true);
  });

  it('returns true when feature_flags omits can_use_api (defaults to true)', async () => {
    state.users.push({ id: 'v', role: 'viewer', organization_id: null });
    state.access.push({ user_id: 'v', client_id: 'c-1' });
    state.clients.push({
      id: 'c-1', organization_id: 'o', is_active: true, feature_flags: {},
    });
    expect(await viewerMayUseRestApi('v')).toBe(true);
  });

  it('returns false when ANY accessible client has can_use_api: false', async () => {
    state.users.push({ id: 'v', role: 'viewer', organization_id: null });
    state.access.push(
      { user_id: 'v', client_id: 'c-1' },
      { user_id: 'v', client_id: 'c-2' },
    );
    state.clients.push(
      { id: 'c-1', organization_id: 'o', is_active: true, feature_flags: { can_use_api: true } },
      { id: 'c-2', organization_id: 'o', is_active: true, feature_flags: { can_use_api: false } },
    );
    expect(await viewerMayUseRestApi('v')).toBe(false);
  });

  it('returns false when the viewer has zero accessible clients', async () => {
    state.users.push({ id: 'v', role: 'viewer', organization_id: null });
    expect(await viewerMayUseRestApi('v')).toBe(false);
  });

  it('treats null feature_flags as defaults (allowed)', async () => {
    state.users.push({ id: 'v', role: 'viewer', organization_id: null });
    state.access.push({ user_id: 'v', client_id: 'c-1' });
    state.clients.push({
      id: 'c-1', organization_id: 'o', is_active: true, feature_flags: null,
    });
    expect(await viewerMayUseRestApi('v')).toBe(true);
  });

  it('uses legacy org fallback to determine the flag set', async () => {
    state.users.push({ id: 'v', role: 'viewer', organization_id: 'org-legacy' });
    state.clients.push(
      { id: 'c-1', organization_id: 'org-legacy', is_active: true, feature_flags: { can_use_api: false } },
    );
    expect(await viewerMayUseRestApi('v')).toBe(false);
  });
});
