import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Effective-access scoping under test.
 *
 * Why this is load-bearing: every admin / portal API route that respects
 * impersonation collapses to this helper. A bug here lets a super_admin
 * impersonating Avondale see Nike's data through any route that re-derives
 * its own scope. The five paths below are the entire authorization matrix.
 *
 *   1. Real admin (no impersonation)        → role='admin', clientIds=null
 *   2. Real admin + impersonate-org + slug  → role='viewer', clientIds=[X]
 *   3. Real admin + impersonate-org alone   → role='viewer', clientIds=[orgs]
 *   4. Slug that doesn't match anything     → falls through to all org clients
 *   5. Real viewer                          → scoped to user_client_access
 *
 * `underlyingRole` always reflects the DB row, regardless of impersonation,
 * so audit/UI surfaces can render an "acting as" pill.
 */

const cookieStore = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { value };
    },
  }),
}));

const { getEffectiveAccessContext, resolveScopedClientId } = await import(
  './effective-access'
);

interface UserRow {
  role?: 'admin' | 'super_admin' | 'viewer' | null;
  organization_id?: string | null;
  is_super_admin?: boolean;
}

interface ClientRow {
  id: string;
  organization_id: string;
  slug?: string;
  is_active: boolean;
}

interface AccessRow {
  user_id: string;
  client_id: string;
}

interface AdminOpts {
  user?: UserRow | null;
  clients?: ClientRow[];
  access?: AccessRow[];
}

function makeAdmin(opts: AdminOpts): SupabaseClient {
  const fromMock = vi.fn((table: string) => {
    if (table === 'users') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(async () => ({ data: opts.user ?? null, error: null })),
      };
      return builder;
    }
    if (table === 'clients') {
      const filters: Record<string, string | boolean> = {};
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: string | boolean) => {
          filters[col] = val;
          return builder;
        }),
        maybeSingle: vi.fn(async () => {
          const matched = (opts.clients ?? []).find((c) =>
            Object.entries(filters).every(
              ([k, v]) => (c as unknown as Record<string, unknown>)[k] === v,
            ),
          );
          return { data: matched ?? null, error: null };
        }),
        // The all-org-clients fetch terminates with an awaited builder; mock
        // the thenable so `await admin.from('clients').select().eq().eq()`
        // resolves to the row set.
        then: (
          resolve: (v: { data: ClientRow[]; error: null }) => unknown,
          reject?: (e: unknown) => unknown,
        ) => {
          const matched = (opts.clients ?? []).filter((c) =>
            Object.entries(filters).every(
              ([k, v]) => (c as unknown as Record<string, unknown>)[k] === v,
            ),
          );
          return Promise.resolve({ data: matched, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return builder;
    }
    if (table === 'user_client_access') {
      const filters: Record<string, string> = {};
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: string) => {
          filters[col] = val;
          return builder;
        }),
        then: (
          resolve: (v: { data: AccessRow[]; error: null }) => unknown,
          reject?: (e: unknown) => unknown,
        ) => {
          const matched = (opts.access ?? []).filter((r) =>
            Object.entries(filters).every(
              ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
            ),
          );
          return Promise.resolve({ data: matched, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from: fromMock } as unknown as SupabaseClient;
}

beforeEach(() => {
  cookieStore.clear();
});

describe('getEffectiveAccessContext', () => {
  it('returns unrestricted admin when role=admin and no impersonation cookie is set', async () => {
    const admin = makeAdmin({
      user: { role: 'admin', organization_id: 'org-nativz', is_super_admin: false },
    });
    const ctx = await getEffectiveAccessContext('user-jack', admin);
    expect(ctx).toEqual({
      userId: 'user-jack',
      role: 'admin',
      isImpersonating: false,
      underlyingRole: 'admin',
      organizationId: null,
      clientIds: null,
      impersonatedClientId: null,
    });
  });

  it('treats is_super_admin=true as admin even when role column says viewer', async () => {
    const admin = makeAdmin({
      user: { role: 'viewer', organization_id: null, is_super_admin: true },
    });
    const ctx = await getEffectiveAccessContext('user-jack', admin);
    expect(ctx.role).toBe('admin');
    expect(ctx.underlyingRole).toBe('super_admin');
    expect(ctx.clientIds).toBeNull();
  });

  it('scopes admin impersonating one brand by slug to a single client_id', async () => {
    cookieStore.set('x-impersonate-org', 'org-x');
    cookieStore.set('x-impersonate-slug', 'nike');
    const admin = makeAdmin({
      user: { role: 'admin', is_super_admin: false },
      clients: [
        { id: 'client-nike', organization_id: 'org-x', slug: 'nike', is_active: true },
        { id: 'client-other', organization_id: 'org-x', slug: 'other', is_active: true },
      ],
    });
    const ctx = await getEffectiveAccessContext('user-jack', admin);
    expect(ctx.role).toBe('viewer');
    expect(ctx.isImpersonating).toBe(true);
    expect(ctx.organizationId).toBe('org-x');
    expect(ctx.clientIds).toEqual(['client-nike']);
    expect(ctx.impersonatedClientId).toBe('client-nike');
    expect(ctx.underlyingRole).toBe('admin');
  });

  it('falls back to every active client in the org when impersonating without a slug', async () => {
    cookieStore.set('x-impersonate-org', 'org-x');
    const admin = makeAdmin({
      user: { role: 'admin', is_super_admin: false },
      clients: [
        { id: 'client-a', organization_id: 'org-x', is_active: true },
        { id: 'client-b', organization_id: 'org-x', is_active: true },
        { id: 'client-other-org', organization_id: 'org-y', is_active: true },
      ],
    });
    const ctx = await getEffectiveAccessContext('user-jack', admin);
    expect(ctx.clientIds).toEqual(['client-a', 'client-b']);
    expect(ctx.impersonatedClientId).toBeNull();
  });

  it('sets impersonatedClientId when the org has exactly one active client', async () => {
    cookieStore.set('x-impersonate-org', 'org-solo');
    const admin = makeAdmin({
      user: { role: 'admin', is_super_admin: true },
      clients: [
        { id: 'client-solo', organization_id: 'org-solo', is_active: true },
      ],
    });
    const ctx = await getEffectiveAccessContext('user-jack', admin);
    expect(ctx.clientIds).toEqual(['client-solo']);
    expect(ctx.impersonatedClientId).toBe('client-solo');
  });

  it('falls back to all org clients when slug points at no client (typo / deactivated)', async () => {
    cookieStore.set('x-impersonate-org', 'org-x');
    cookieStore.set('x-impersonate-slug', 'gone');
    const admin = makeAdmin({
      user: { role: 'admin', is_super_admin: false },
      clients: [
        { id: 'client-a', organization_id: 'org-x', slug: 'nike', is_active: true },
        { id: 'client-b', organization_id: 'org-x', slug: 'other', is_active: true },
      ],
    });
    const ctx = await getEffectiveAccessContext('user-jack', admin);
    // No match for slug=gone → fallback to every active client in org-x.
    expect(ctx.clientIds).toEqual(['client-a', 'client-b']);
  });

  it('ignores empty / whitespace-only impersonation slug as if not set', async () => {
    cookieStore.set('x-impersonate-org', 'org-x');
    cookieStore.set('x-impersonate-slug', '   ');
    const admin = makeAdmin({
      user: { role: 'admin', is_super_admin: true },
      clients: [
        { id: 'client-a', organization_id: 'org-x', is_active: true },
        { id: 'client-b', organization_id: 'org-x', is_active: true },
      ],
    });
    const ctx = await getEffectiveAccessContext('user-jack', admin);
    expect(ctx.clientIds).toEqual(['client-a', 'client-b']);
  });

  it('returns admin (unrestricted) when only the slug cookie is set without an org', async () => {
    cookieStore.set('x-impersonate-slug', 'nike');
    const admin = makeAdmin({
      user: { role: 'admin', is_super_admin: false },
    });
    const ctx = await getEffectiveAccessContext('user-jack', admin);
    expect(ctx.role).toBe('admin');
    expect(ctx.isImpersonating).toBe(false);
  });

  it('does not honour impersonation cookies when the caller is not actually an admin', async () => {
    cookieStore.set('x-impersonate-org', 'org-x');
    cookieStore.set('x-impersonate-slug', 'nike');
    const admin = makeAdmin({
      user: { role: 'viewer', organization_id: 'org-viewer', is_super_admin: false },
      access: [{ user_id: 'user-mallory', client_id: 'client-real-access' }],
    });
    const ctx = await getEffectiveAccessContext('user-mallory', admin);
    expect(ctx.role).toBe('viewer');
    expect(ctx.isImpersonating).toBe(false);
    expect(ctx.clientIds).toEqual(['client-real-access']);
    expect(ctx.organizationId).toBe('org-viewer');
  });

  it('viewer with no user_client_access rows gets clientIds=[] (not null)', async () => {
    const admin = makeAdmin({
      user: { role: 'viewer', organization_id: 'org-x', is_super_admin: false },
      access: [],
    });
    const ctx = await getEffectiveAccessContext('user-mallory', admin);
    expect(ctx.role).toBe('viewer');
    expect(ctx.clientIds).toEqual([]);
  });

  it('accepts either a User object or a bare userId string', async () => {
    const admin = makeAdmin({
      user: { role: 'admin', is_super_admin: false },
    });
    const ctxFromString = await getEffectiveAccessContext('user-jack', admin);
    const ctxFromUser = await getEffectiveAccessContext(
      { id: 'user-jack' } as never,
      admin,
    );
    expect(ctxFromString.userId).toBe('user-jack');
    expect(ctxFromUser.userId).toBe('user-jack');
  });

  it('returns underlyingRole=null when the users row is missing entirely', async () => {
    const admin = makeAdmin({ user: null, access: [] });
    const ctx = await getEffectiveAccessContext('user-ghost', admin);
    expect(ctx.underlyingRole).toBeNull();
    expect(ctx.role).toBe('viewer'); // ghost defaults to viewer with empty scope
    expect(ctx.clientIds).toEqual([]);
  });
});

describe('resolveScopedClientId', () => {
  const adminCtx = {
    userId: 'u',
    role: 'admin' as const,
    isImpersonating: false,
    underlyingRole: 'admin' as const,
    organizationId: null,
    clientIds: null,
    impersonatedClientId: null,
  };

  const impersonatingCtx = {
    userId: 'u',
    role: 'viewer' as const,
    isImpersonating: true,
    underlyingRole: 'admin' as const,
    organizationId: 'org-x',
    clientIds: ['client-a', 'client-b'],
    impersonatedClientId: 'client-a',
  };

  const viewerCtx = {
    userId: 'u',
    role: 'viewer' as const,
    isImpersonating: false,
    underlyingRole: 'viewer' as const,
    organizationId: 'org-y',
    clientIds: ['client-x'],
    impersonatedClientId: null,
  };

  it('passes the requested clientId through verbatim for an unrestricted admin', () => {
    expect(resolveScopedClientId(adminCtx, 'client-anything')).toBe('client-anything');
    expect(resolveScopedClientId(adminCtx, null)).toBeNull();
  });

  it('falls back to impersonatedClientId when admin is impersonating and requested is null', () => {
    expect(resolveScopedClientId(impersonatingCtx, null)).toBe('client-a');
  });

  it('returns the requested clientId when impersonator has access to it', () => {
    expect(resolveScopedClientId(impersonatingCtx, 'client-b')).toBe('client-b');
  });

  it('denies the requested clientId when impersonator has no access to it', () => {
    expect(resolveScopedClientId(impersonatingCtx, 'client-other')).toBe('deny');
  });

  it('passes the requested clientId for a real viewer when they have access', () => {
    expect(resolveScopedClientId(viewerCtx, 'client-x')).toBe('client-x');
  });

  it('denies the requested clientId for a real viewer when they have no access', () => {
    expect(resolveScopedClientId(viewerCtx, 'client-foreign')).toBe('deny');
  });

  it('returns null for a real viewer who passes null and has no impersonation', () => {
    expect(resolveScopedClientId(viewerCtx, null)).toBeNull();
  });
});
