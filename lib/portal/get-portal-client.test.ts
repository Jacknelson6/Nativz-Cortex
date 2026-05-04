import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * getPortalClient resolves the brand context for the current portal request.
 * The function is the single source of truth for "which client is this user
 * looking at right now" and powers every portal-scoped page + API route.
 *
 * Resolution order under test:
 *   1. Admin impersonation via `x-impersonate-org` (+ optional slug)
 *   2. Active client cookie (`x-portal-active-client`) for multi-brand users
 *   3. First row in `user_client_access` (default brand)
 *   4. Legacy fallback to `users.organization_id` for pre-migration accounts
 *
 * Each step short-circuits if it produces a hit. Failures fall through to
 * the next step rather than erroring (the user is never logged out for a
 * missing cookie). The result also normalises feature_flags through the
 * defaults merge so a partial JSON blob can never wipe a flag.
 */

const getUserMock = vi.fn();
const cookieStore = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined,
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

interface UserRow {
  id: string;
  role: 'admin' | 'super_admin' | 'viewer' | null;
  is_super_admin: boolean | null;
  organization_id: string | null;
}

interface ClientRow {
  id: string;
  name: string;
  slug: string;
  industry: string;
  feature_flags: unknown;
  preferences: unknown;
  organization_id: string;
  is_active: boolean;
}

interface AccessRow {
  user_id: string;
  client_id: string;
  organization_id: string;
}

interface MockState {
  users: UserRow[];
  clients: ClientRow[];
  access: AccessRow[];
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
            const row = state.users.find(
              (u) => u.id === filters.id,
            );
            return { data: row ?? null, error: row ? null : { message: 'not found' } };
          },
        };
        return builder;
      }

      if (table === 'clients') {
        const filters: Record<string, unknown> = {};
        let limit = Number.POSITIVE_INFINITY;
        const matches = () =>
          state.clients.filter((c) =>
            Object.entries(filters).every(([k, v]) => (c as unknown as Record<string, unknown>)[k] === v),
          );
        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return builder;
          },
          limit: (n: number) => {
            limit = n;
            return Promise.resolve({ data: matches().slice(0, limit), error: null });
          },
          single: async () => {
            const rows = matches();
            return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } };
          },
          maybeSingle: async () => {
            const rows = matches();
            return { data: rows[0] ?? null, error: null };
          },
        };
        return builder;
      }

      if (table === 'user_client_access') {
        const filters: Record<string, unknown> = {};
        let limit = Number.POSITIVE_INFINITY;
        const matches = () =>
          state.access.filter((a) =>
            Object.entries(filters).every(([k, v]) => (a as unknown as Record<string, unknown>)[k] === v),
          );
        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return builder;
          },
          limit: (n: number) => {
            limit = n;
            return Promise.resolve({ data: matches().slice(0, limit), error: null });
          },
          single: async () => {
            const rows = matches();
            return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } };
          },
        };
        return builder;
      }

      throw new Error(`unexpected table: ${table}`);
    },
  };
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => makeAdmin()),
}));

const { getPortalClient } = await import('./get-portal-client');

const BASE_CLIENT: ClientRow = {
  id: 'client-1',
  name: 'Acme',
  slug: 'acme',
  industry: 'fashion',
  feature_flags: { can_view_calendar: true },
  preferences: { tone: 'playful' },
  organization_id: 'org-acme',
  is_active: true,
};

beforeEach(() => {
  cookieStore.clear();
  getUserMock.mockReset();
  state = {
    users: [],
    clients: [],
    access: [],
  };
});

describe('getPortalClient — auth gates', () => {
  it('returns null when there is no authenticated user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getPortalClient()).toBeNull();
  });
});

describe('getPortalClient — admin impersonation (priority 1)', () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    state.users.push({
      id: 'admin-1',
      role: 'admin',
      is_super_admin: false,
      organization_id: null,
    });
  });

  it('returns the impersonated client when slug + org both match', async () => {
    cookieStore.set('x-impersonate-org', 'org-acme');
    cookieStore.set('x-impersonate-slug', 'acme');
    state.clients.push(BASE_CLIENT, {
      ...BASE_CLIENT,
      id: 'client-2',
      slug: 'acme-eu',
    });
    const result = await getPortalClient();
    expect(result?.client.id).toBe('client-1');
    expect(result?.organizationId).toBe('org-acme');
  });

  it('returns null when slug is set but does not match any active client in that org', async () => {
    cookieStore.set('x-impersonate-org', 'org-acme');
    cookieStore.set('x-impersonate-slug', 'typo');
    state.clients.push(BASE_CLIENT);
    expect(await getPortalClient()).toBeNull();
  });

  it('falls back to the first active client of the org when no slug is provided', async () => {
    cookieStore.set('x-impersonate-org', 'org-acme');
    state.clients.push(BASE_CLIENT);
    const result = await getPortalClient();
    expect(result?.client.id).toBe('client-1');
  });

  it('honours is_super_admin even when role is null', async () => {
    state.users[0].role = null;
    state.users[0].is_super_admin = true;
    cookieStore.set('x-impersonate-org', 'org-acme');
    state.clients.push(BASE_CLIENT);
    const result = await getPortalClient();
    expect(result?.client.id).toBe('client-1');
  });

  it('rejects impersonation by a viewer (falls through to next steps)', async () => {
    state.users[0].role = 'viewer';
    state.users[0].is_super_admin = false;
    cookieStore.set('x-impersonate-org', 'org-acme');
    // No active-client cookie, no access rows -> the function falls through
    // every step and ends with no organization_id, so returns null.
    expect(await getPortalClient()).toBeNull();
  });

  it('returns null when impersonating an org that has no active clients', async () => {
    cookieStore.set('x-impersonate-org', 'org-empty');
    expect(await getPortalClient()).toBeNull();
  });

  it('skips inactive clients when matching slug', async () => {
    cookieStore.set('x-impersonate-org', 'org-acme');
    cookieStore.set('x-impersonate-slug', 'acme');
    state.clients.push({ ...BASE_CLIENT, is_active: false });
    expect(await getPortalClient()).toBeNull();
  });

  it('merges feature_flags with defaults (defaults fill in missing keys)', async () => {
    cookieStore.set('x-impersonate-org', 'org-acme');
    state.clients.push({ ...BASE_CLIENT, feature_flags: { can_view_calendar: true } });
    const result = await getPortalClient();
    expect(result?.client.feature_flags.can_view_calendar).toBe(true);
    // Defaults should also be present.
    expect(result?.client.feature_flags.can_search).toBe(true);
    expect(result?.client.feature_flags.can_view_reports).toBe(true);
  });
});

describe('getPortalClient — active-client cookie (priority 2)', () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'viewer-1' } }, error: null });
    state.users.push({
      id: 'viewer-1',
      role: 'viewer',
      is_super_admin: false,
      organization_id: null,
    });
  });

  it('returns the cookie-pinned client when the user has access to it', async () => {
    cookieStore.set('x-portal-active-client', 'client-1');
    state.access.push({ user_id: 'viewer-1', client_id: 'client-1', organization_id: 'org-acme' });
    state.clients.push(BASE_CLIENT);
    const result = await getPortalClient();
    expect(result?.client.id).toBe('client-1');
    expect(result?.organizationId).toBe('org-acme');
  });

  it('falls through when the cookie points at a client the user cannot access', async () => {
    cookieStore.set('x-portal-active-client', 'client-stranger');
    state.access.push({ user_id: 'viewer-1', client_id: 'client-1', organization_id: 'org-acme' });
    state.clients.push(BASE_CLIENT);
    // Falls through to step 3, which picks the user's first access row.
    const result = await getPortalClient();
    expect(result?.client.id).toBe('client-1');
  });

  it('falls through when the cookie-pinned client is inactive', async () => {
    cookieStore.set('x-portal-active-client', 'client-1');
    state.access.push({ user_id: 'viewer-1', client_id: 'client-1', organization_id: 'org-acme' });
    state.clients.push({ ...BASE_CLIENT, is_active: false });
    // Step 2 falls through (client lookup misses on is_active),
    // step 3 also falls through for the same reason -> step 4 (no org_id) -> null.
    expect(await getPortalClient()).toBeNull();
  });
});

describe('getPortalClient — default access row (priority 3)', () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'viewer-1' } }, error: null });
    state.users.push({
      id: 'viewer-1',
      role: 'viewer',
      is_super_admin: false,
      organization_id: null,
    });
  });

  it('returns the first accessible client when no cookies are set', async () => {
    state.access.push({ user_id: 'viewer-1', client_id: 'client-1', organization_id: 'org-acme' });
    state.clients.push(BASE_CLIENT);
    const result = await getPortalClient();
    expect(result?.client.id).toBe('client-1');
    expect(result?.organizationId).toBe('org-acme');
  });
});

describe('getPortalClient — legacy users.organization_id fallback (priority 4)', () => {
  it('falls back to the user.organization_id when there are no access rows', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'legacy-1' } }, error: null });
    state.users.push({
      id: 'legacy-1',
      role: 'viewer',
      is_super_admin: false,
      organization_id: 'org-legacy',
    });
    state.clients.push({ ...BASE_CLIENT, organization_id: 'org-legacy' });
    const result = await getPortalClient();
    expect(result?.client.id).toBe('client-1');
    expect(result?.organizationId).toBe('org-legacy');
  });

  it('returns null when the legacy user has no organization_id', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'orphan-1' } }, error: null });
    state.users.push({
      id: 'orphan-1',
      role: 'viewer',
      is_super_admin: false,
      organization_id: null,
    });
    expect(await getPortalClient()).toBeNull();
  });

  it('returns null when the legacy organization has no active clients', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'legacy-2' } }, error: null });
    state.users.push({
      id: 'legacy-2',
      role: 'viewer',
      is_super_admin: false,
      organization_id: 'org-empty',
    });
    expect(await getPortalClient()).toBeNull();
  });
});

describe('getPortalClient — preferences passthrough', () => {
  it('exposes preferences verbatim from the row', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'viewer-1' } }, error: null });
    state.users.push({
      id: 'viewer-1',
      role: 'viewer',
      is_super_admin: false,
      organization_id: null,
    });
    state.access.push({ user_id: 'viewer-1', client_id: 'client-1', organization_id: 'org-acme' });
    state.clients.push({ ...BASE_CLIENT, preferences: { tone: 'expert', voice: 'calm' } });
    const result = await getPortalClient();
    expect(result?.client.preferences).toEqual({ tone: 'expert', voice: 'calm' });
  });

  it('preserves a null preferences value', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'viewer-1' } }, error: null });
    state.users.push({
      id: 'viewer-1',
      role: 'viewer',
      is_super_admin: false,
      organization_id: null,
    });
    state.access.push({ user_id: 'viewer-1', client_id: 'client-1', organization_id: 'org-acme' });
    state.clients.push({ ...BASE_CLIENT, preferences: null });
    const result = await getPortalClient();
    expect(result?.client.preferences).toBeNull();
  });
});
