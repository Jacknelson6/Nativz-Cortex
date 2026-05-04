import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * get-viewer-brands powers the shared `(app)` shell brand pill for portal
 * users. Two exports under test:
 *
 * 1. listViewerAccessibleBrands(userId)
 *    - Reads user_client_access -> joined clients(id,name,slug,logo_url,
 *      agency,is_active)
 *    - Filters out null clients (orphaned access rows) and is_active=false
 *    - Strips is_active from the returned shape (callers expect AdminBrand)
 *    - Sorts the result alphabetically by name
 *
 * 2. getActiveViewerBrand(userId)
 *    - Honours the `x-portal-active-client` cookie when the user actually
 *      has access to that client (returns source: 'cookie')
 *    - Falls through to the first user_client_access row when the cookie
 *      is missing OR points at a brand the user no longer has access to
 *      OR points at an inactive brand (returns source: 'first-access')
 *    - Returns brand: null + source: 'none' when the viewer has no access
 *    - Trims whitespace and treats whitespace-only cookies as absent
 */

const cookieStore = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined,
  }),
}));

interface JoinedClient {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  agency: string | null;
  is_active: boolean;
}

interface AccessRow {
  user_id: string;
  client_id: string;
  clients: JoinedClient | null;
}

interface MockState {
  access: AccessRow[];
}

let state: MockState;

function makeAdmin() {
  return {
    from: (table: string) => {
      if (table !== 'user_client_access') {
        throw new Error(`unexpected table: ${table}`);
      }
      const filters: Record<string, unknown> = {};
      let limit = Number.POSITIVE_INFINITY;
      const matches = () =>
        state.access.filter((a) =>
          Object.entries(filters).every(([k, v]) => (a as unknown as Record<string, unknown>)[k] === v),
        );
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return Object.assign(builder, {
            then: (resolve: (v: { data: AccessRow[]; error: null }) => unknown) =>
              resolve({ data: matches().slice(0, limit), error: null }),
          });
        },
        limit: (n: number) => {
          limit = n;
          return Promise.resolve({ data: matches().slice(0, limit), error: null });
        },
        maybeSingle: async () => {
          const rows = matches();
          return { data: rows[0] ?? null, error: null };
        },
      });
      return builder;
    },
  };
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => makeAdmin()),
}));

const { listViewerAccessibleBrands, getActiveViewerBrand } = await import('./get-viewer-brands');

function makeJoined(overrides: Partial<JoinedClient> = {}): JoinedClient {
  return {
    id: 'c-1',
    name: 'Acme',
    slug: 'acme',
    logo_url: null,
    agency: null,
    is_active: true,
    ...overrides,
  };
}

beforeEach(() => {
  cookieStore.clear();
  state = { access: [] };
});

describe('listViewerAccessibleBrands', () => {
  it('returns [] when the viewer has no access rows', async () => {
    expect(await listViewerAccessibleBrands('v-1')).toEqual([]);
  });

  it('strips is_active from the returned brands', async () => {
    state.access.push({
      user_id: 'v-1',
      client_id: 'c-1',
      clients: makeJoined(),
    });
    const brands = await listViewerAccessibleBrands('v-1');
    expect(brands).toHaveLength(1);
    expect(brands[0]).not.toHaveProperty('is_active');
    expect(brands[0]).toEqual({ id: 'c-1', name: 'Acme', slug: 'acme', logo_url: null, agency: null });
  });

  it('filters out inactive clients', async () => {
    state.access.push(
      { user_id: 'v-1', client_id: 'c-1', clients: makeJoined({ id: 'c-1', name: 'Active' }) },
      { user_id: 'v-1', client_id: 'c-2', clients: makeJoined({ id: 'c-2', name: 'Dead', is_active: false }) },
    );
    const brands = await listViewerAccessibleBrands('v-1');
    expect(brands.map((b) => b.id)).toEqual(['c-1']);
  });

  it('filters out null clients (orphan access rows)', async () => {
    state.access.push(
      { user_id: 'v-1', client_id: 'c-1', clients: makeJoined({ id: 'c-1', name: 'Real' }) },
      { user_id: 'v-1', client_id: 'c-orphan', clients: null },
    );
    const brands = await listViewerAccessibleBrands('v-1');
    expect(brands.map((b) => b.id)).toEqual(['c-1']);
  });

  it('sorts brands alphabetically by name', async () => {
    state.access.push(
      { user_id: 'v-1', client_id: 'c-1', clients: makeJoined({ id: 'c-1', name: 'Charlie' }) },
      { user_id: 'v-1', client_id: 'c-2', clients: makeJoined({ id: 'c-2', name: 'alpha' }) },
      { user_id: 'v-1', client_id: 'c-3', clients: makeJoined({ id: 'c-3', name: 'Bravo' }) },
    );
    const brands = await listViewerAccessibleBrands('v-1');
    expect(brands.map((b) => b.name)).toEqual(['alpha', 'Bravo', 'Charlie']);
  });

  it('scopes by user_id (other users access does not leak)', async () => {
    state.access.push(
      { user_id: 'v-1', client_id: 'c-1', clients: makeJoined({ id: 'c-1', name: 'Mine' }) },
      { user_id: 'v-2', client_id: 'c-2', clients: makeJoined({ id: 'c-2', name: 'Theirs' }) },
    );
    const brands = await listViewerAccessibleBrands('v-1');
    expect(brands).toHaveLength(1);
    expect(brands[0].id).toBe('c-1');
  });
});

describe('getActiveViewerBrand', () => {
  it('returns the cookie-pinned brand when the user has access', async () => {
    cookieStore.set('x-portal-active-client', 'c-1');
    state.access.push({
      user_id: 'v-1',
      client_id: 'c-1',
      clients: makeJoined(),
    });
    const result = await getActiveViewerBrand('v-1');
    expect(result.source).toBe('cookie');
    expect(result.brand?.id).toBe('c-1');
    expect(result.brand).not.toHaveProperty('is_active');
  });

  it('falls through to first-access when the cookie targets a brand the viewer cannot access', async () => {
    cookieStore.set('x-portal-active-client', 'c-stranger');
    state.access.push({
      user_id: 'v-1',
      client_id: 'c-1',
      clients: makeJoined({ id: 'c-1', name: 'Real' }),
    });
    const result = await getActiveViewerBrand('v-1');
    expect(result.source).toBe('first-access');
    expect(result.brand?.id).toBe('c-1');
  });

  it('falls through when the cookie targets an inactive brand', async () => {
    cookieStore.set('x-portal-active-client', 'c-dead');
    // c-live is first in the access list so the .limit(1) fallback hits it.
    state.access.push(
      { user_id: 'v-1', client_id: 'c-live', clients: makeJoined({ id: 'c-live', name: 'Live' }) },
      { user_id: 'v-1', client_id: 'c-dead', clients: makeJoined({ id: 'c-dead', is_active: false }) },
    );
    const result = await getActiveViewerBrand('v-1');
    expect(result.source).toBe('first-access');
    expect(result.brand?.id).toBe('c-live');
  });

  it('returns first-access when no cookie is set', async () => {
    state.access.push({
      user_id: 'v-1',
      client_id: 'c-1',
      clients: makeJoined(),
    });
    const result = await getActiveViewerBrand('v-1');
    expect(result.source).toBe('first-access');
    expect(result.brand?.id).toBe('c-1');
  });

  it('treats a whitespace-only cookie as absent', async () => {
    cookieStore.set('x-portal-active-client', '   ');
    state.access.push({
      user_id: 'v-1',
      client_id: 'c-1',
      clients: makeJoined(),
    });
    const result = await getActiveViewerBrand('v-1');
    expect(result.source).toBe('first-access');
  });

  it('trims whitespace around a valid cookie value', async () => {
    cookieStore.set('x-portal-active-client', '  c-1  ');
    state.access.push({
      user_id: 'v-1',
      client_id: 'c-1',
      clients: makeJoined(),
    });
    const result = await getActiveViewerBrand('v-1');
    expect(result.source).toBe('cookie');
    expect(result.brand?.id).toBe('c-1');
  });

  it('returns brand: null + source: none when the viewer has no access at all', async () => {
    const result = await getActiveViewerBrand('v-1');
    expect(result).toEqual({ brand: null, source: 'none' });
  });

  it('returns none when the only access row points to an inactive brand', async () => {
    state.access.push({
      user_id: 'v-1',
      client_id: 'c-dead',
      clients: makeJoined({ is_active: false }),
    });
    const result = await getActiveViewerBrand('v-1');
    expect(result.brand).toBeNull();
    expect(result.source).toBe('none');
  });

  it('returns none when the only access row has a null joined client', async () => {
    state.access.push({ user_id: 'v-1', client_id: 'c-orphan', clients: null });
    const result = await getActiveViewerBrand('v-1');
    expect(result).toEqual({ brand: null, source: 'none' });
  });
});
