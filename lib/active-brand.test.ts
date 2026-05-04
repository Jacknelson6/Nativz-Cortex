import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `lib/active-brand.ts` is the resolver every server page in the shared
 * `(app)` shell calls to figure out which brand the user is currently
 * working on. It feeds the sidebar pill, brand-profile, audit, and ~50
 * other pages. Three contracts to pin:
 *
 *   1. Precedence is URL override > cookie > first-accessible fallback. A
 *      regression that flipped the order would let a stale cookie shadow a
 *      `?clientId=` deep link, which is the load-bearing affordance for
 *      "open this in a new tab" workflows.
 *
 *   2. Impersonation cookies (`x-impersonate-org` + `x-impersonate-slug`)
 *      flip `isAdmin: false` even for admin users, so brand-profile and the
 *      shared shell render the viewer surface. A regression that left
 *      `isAdmin: true` would hand admin tools to anyone the owner is
 *      impersonating, defeating the whole point.
 *
 *   3. Viewers (non-admins) get their brand resolved via the viewer-brands
 *      module, NOT via the admin cookie. The viewer brand carries
 *      `isAdmin: false`. A regression that read the admin cookie for
 *      viewers would let portal users escape their `user_client_access`
 *      scoping.
 *
 *   `listAdminAccessibleBrands` is the supplier for the first-accessible
 *   fallback and the sidebar brand picker. Pin: returns [] for non-admins
 *   so viewers can't enumerate the agency portfolio.
 */

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));
vi.mock('@/lib/clients/roster-visibility-query', () => ({
  selectClientsWithRosterVisibility: vi.fn(),
}));
vi.mock('@/lib/portal/get-viewer-brands', () => ({
  getActiveViewerBrand: vi.fn(),
}));

import {
  ADMIN_ACTIVE_CLIENT_COOKIE,
  getActiveBrand,
  listAdminAccessibleBrands,
  type AdminBrand,
} from './active-brand';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { getActiveViewerBrand } from '@/lib/portal/get-viewer-brands';

type UserRoleRow = { role?: string | null; is_super_admin?: boolean | null } | null;

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  agency: string | null;
} | null;

interface SetupOpts {
  user: { id: string } | null;
  roleRow: UserRoleRow;
  cookies?: Record<string, string>;
  /** The clients-row that the lookup-by-id query returns. */
  clientById?: ClientRow;
  /** The clients-row that the impersonation lookup (org + slug) returns. */
  impersonatedClient?: ClientRow;
  /** Result of the listAdminAccessibleBrands roster query. */
  accessibleBrands?: AdminBrand[];
  /** Result of the viewer-brand resolver (non-admin path). */
  viewerBrand?: { brand: AdminBrand | null; source: 'cookie' | 'first-access' | 'none' };
}

function setup(opts: SetupOpts) {
  const cookieMap = opts.cookies ?? {};
  const cookieGet = vi.fn((name: string) =>
    cookieMap[name] !== undefined ? { value: cookieMap[name] } : undefined,
  );
  vi.mocked(cookies).mockResolvedValue({
    get: cookieGet,
  } as unknown as Awaited<ReturnType<typeof cookies>>);

  const getUser = vi.fn().mockResolvedValue({ data: { user: opts.user } });
  const serverClient = { auth: { getUser } };
  vi.mocked(createServerSupabaseClient).mockResolvedValue(
    serverClient as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>,
  );

  // Build a `from()` mock that branches by table name, returning a chain
  // that resolves with the right shape.
  const adminClient = {
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: opts.roleRow }),
            }),
          }),
        };
      }
      if (table === 'clients') {
        // The two clients() lookups (impersonation by org+slug, candidate
        // by id) both end in maybeSingle. We disambiguate by inspecting
        // the eq() call sequence: impersonation chains org → slug →
        // is_active, candidate chains id → is_active. We track the first
        // .eq() call to decide which row to return.
        let firstEqColumn: string | null = null;
        const chain = {
          eq: (col: string, _val: string) => {
            if (firstEqColumn === null) firstEqColumn = col;
            return chain;
          },
          maybeSingle: () =>
            Promise.resolve({
              data:
                firstEqColumn === 'organization_id'
                  ? (opts.impersonatedClient ?? null)
                  : (opts.clientById ?? null),
            }),
        };
        return {
          select: () => chain,
        };
      }
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) };
    }),
  };
  vi.mocked(createAdminClient).mockReturnValue(
    adminClient as unknown as ReturnType<typeof createAdminClient>,
  );

  vi.mocked(selectClientsWithRosterVisibility).mockResolvedValue({
    data: opts.accessibleBrands ?? [],
  } as Awaited<ReturnType<typeof selectClientsWithRosterVisibility>>);

  vi.mocked(getActiveViewerBrand).mockResolvedValue(
    opts.viewerBrand ?? { brand: null, source: 'none' },
  );

  return { adminClient, cookieGet };
}

const ADMIN_ROLE: UserRoleRow = { role: 'admin', is_super_admin: false };
const SUPER_ADMIN_ROLE: UserRoleRow = { role: 'admin', is_super_admin: true };
const VIEWER_ROLE: UserRoleRow = { role: 'viewer', is_super_admin: false };

const NIKE: AdminBrand = {
  id: 'nike-id',
  name: 'Nike',
  slug: 'nike',
  logo_url: null,
  agency: null,
};
const ADIDAS: AdminBrand = {
  id: 'adidas-id',
  name: 'Adidas',
  slug: 'adidas',
  logo_url: null,
  agency: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getActiveBrand — unauthenticated', () => {
  it('returns { brand: null, source: "none", isAdmin: false } when no user', async () => {
    setup({ user: null, roleRow: null });
    const result = await getActiveBrand();
    expect(result).toEqual({ brand: null, source: 'none', isAdmin: false });
  });
});

describe('getActiveBrand — viewer (non-admin) path', () => {
  it('delegates to getActiveViewerBrand and returns its brand + source with isAdmin:false', async () => {
    setup({
      user: { id: 'viewer-1' },
      roleRow: VIEWER_ROLE,
      viewerBrand: { brand: NIKE, source: 'cookie' },
    });
    const result = await getActiveBrand();
    expect(result.brand).toEqual(NIKE);
    expect(result.source).toBe('cookie');
    expect(result.isAdmin).toBe(false);
    expect(getActiveViewerBrand).toHaveBeenCalledWith('viewer-1');
  });

  it('does NOT consult the admin cookie for viewers', async () => {
    // Pin: a regression that read the admin cookie for viewers would let
    // portal users escape their user_client_access scoping.
    const { cookieGet } = setup({
      user: { id: 'viewer-1' },
      roleRow: VIEWER_ROLE,
      cookies: { [ADMIN_ACTIVE_CLIENT_COOKIE]: 'tampered-id' },
      viewerBrand: { brand: NIKE, source: 'first-access' },
    });
    await getActiveBrand();
    expect(cookieGet).not.toHaveBeenCalledWith(ADMIN_ACTIVE_CLIENT_COOKIE);
  });

  it('passes the viewer source through verbatim (first-access)', async () => {
    setup({
      user: { id: 'viewer-1' },
      roleRow: VIEWER_ROLE,
      viewerBrand: { brand: NIKE, source: 'first-access' },
    });
    const result = await getActiveBrand();
    expect(result.source).toBe('first-access');
  });

  it('returns null brand when the viewer has no accessible brands', async () => {
    setup({
      user: { id: 'viewer-1' },
      roleRow: VIEWER_ROLE,
      viewerBrand: { brand: null, source: 'none' },
    });
    const result = await getActiveBrand();
    expect(result.brand).toBeNull();
    expect(result.source).toBe('none');
    expect(result.isAdmin).toBe(false);
  });

  it('treats a null users row as non-admin (defensive)', async () => {
    // Pin: a missing users row must not be treated as admin. The viewer
    // path runs and returns isAdmin:false.
    setup({
      user: { id: 'unknown-1' },
      roleRow: null,
      viewerBrand: { brand: NIKE, source: 'cookie' },
    });
    const result = await getActiveBrand();
    expect(result.isAdmin).toBe(false);
  });
});

describe('getActiveBrand — admin precedence: URL > cookie > fallback', () => {
  it('uses the URL override when both URL and cookie are set, source = "url"', async () => {
    // Pin: deep links must win over a stale cookie. URL override is the
    // load-bearing affordance for "open in a new tab" admin workflows.
    setup({
      user: { id: 'admin-1' },
      roleRow: ADMIN_ROLE,
      cookies: { [ADMIN_ACTIVE_CLIENT_COOKIE]: 'cookie-id' },
      clientById: NIKE,
    });
    const result = await getActiveBrand('url-id');
    expect(result.brand).toEqual(NIKE);
    expect(result.source).toBe('url');
    expect(result.isAdmin).toBe(true);
  });

  it('falls back to cookie when no URL override is given, source = "cookie"', async () => {
    setup({
      user: { id: 'admin-1' },
      roleRow: ADMIN_ROLE,
      cookies: { [ADMIN_ACTIVE_CLIENT_COOKIE]: 'cookie-id' },
      clientById: NIKE,
    });
    const result = await getActiveBrand();
    expect(result.brand).toEqual(NIKE);
    expect(result.source).toBe('cookie');
  });

  it('treats whitespace-only URL override as absent, falls back to cookie', async () => {
    setup({
      user: { id: 'admin-1' },
      roleRow: ADMIN_ROLE,
      cookies: { [ADMIN_ACTIVE_CLIENT_COOKIE]: 'cookie-id' },
      clientById: NIKE,
    });
    const result = await getActiveBrand('   ');
    expect(result.source).toBe('cookie');
  });

  it('treats null URL override as absent, falls back to cookie', async () => {
    setup({
      user: { id: 'admin-1' },
      roleRow: ADMIN_ROLE,
      cookies: { [ADMIN_ACTIVE_CLIENT_COOKIE]: 'cookie-id' },
      clientById: NIKE,
    });
    const result = await getActiveBrand(null);
    expect(result.source).toBe('cookie');
  });

  it('uses first-accessible fallback when neither URL nor cookie is set, source = "first-access"', async () => {
    // Pin: fresh admins land on a usable brand instead of "Select a brand"
    // forever. The fallback is the first alphabetically-ordered accessible
    // brand.
    setup({
      user: { id: 'admin-1' },
      roleRow: ADMIN_ROLE,
      accessibleBrands: [ADIDAS, NIKE],
    });
    const result = await getActiveBrand();
    expect(result.brand).toEqual(ADIDAS);
    expect(result.source).toBe('first-access');
    expect(result.isAdmin).toBe(true);
  });

  it('returns { source: "none" } when fallback list is empty', async () => {
    setup({
      user: { id: 'admin-1' },
      roleRow: ADMIN_ROLE,
      accessibleBrands: [],
    });
    const result = await getActiveBrand();
    expect(result.brand).toBeNull();
    expect(result.source).toBe('none');
    expect(result.isAdmin).toBe(true);
  });

  it('falls back to first-accessible when the cookie points at an invalid client', async () => {
    // Pin: stale cookies (deleted/deactivated/tampered brand) used to
    // strand the user on "Select a brand" forever. The fallback fires
    // here too — both "no candidate" and "invalid candidate" paths reach
    // the same recovery surface.
    setup({
      user: { id: 'admin-1' },
      roleRow: ADMIN_ROLE,
      cookies: { [ADMIN_ACTIVE_CLIENT_COOKIE]: 'deleted-id' },
      clientById: null,
      accessibleBrands: [NIKE],
    });
    const result = await getActiveBrand();
    expect(result.brand).toEqual(NIKE);
    expect(result.source).toBe('first-access');
  });

  it('grants admin via super_admin role string', async () => {
    setup({
      user: { id: 'admin-1' },
      roleRow: { role: 'super_admin', is_super_admin: false },
      cookies: { [ADMIN_ACTIVE_CLIENT_COOKIE]: 'cookie-id' },
      clientById: NIKE,
    });
    const result = await getActiveBrand();
    expect(result.isAdmin).toBe(true);
  });

  it('grants admin via is_super_admin=true even when role is "viewer"', async () => {
    // Same OR contract as requireAdmin: legacy super-admins kept role='viewer'
    // but is_super_admin=true; must still resolve as admin here.
    setup({
      user: { id: 'admin-1' },
      roleRow: { role: 'viewer', is_super_admin: true },
      cookies: { [ADMIN_ACTIVE_CLIENT_COOKIE]: 'cookie-id' },
      clientById: NIKE,
    });
    const result = await getActiveBrand();
    expect(result.isAdmin).toBe(true);
  });
});

describe('getActiveBrand — impersonation', () => {
  it('resolves the impersonated brand by org+slug when both cookies are set, isAdmin flips false', async () => {
    // Pin: impersonation is the whole "View as <client>" affordance. The
    // shared shell needs isAdmin:false so editor-vs-readonly switches
    // render the viewer surface.
    setup({
      user: { id: 'admin-1' },
      roleRow: SUPER_ADMIN_ROLE,
      cookies: {
        'x-impersonate-org': 'org-123',
        'x-impersonate-slug': 'nike',
        [ADMIN_ACTIVE_CLIENT_COOKIE]: 'unused-cookie',
      },
      impersonatedClient: NIKE,
    });
    const result = await getActiveBrand();
    expect(result.brand).toEqual(NIKE);
    expect(result.source).toBe('cookie');
    expect(result.isAdmin).toBe(false);
  });

  it('falls through to the normal cookie path when only one impersonation cookie is set', async () => {
    // Defensive: half-set cookies (after a botched exit) must not strand
    // the admin in a phantom impersonation.
    setup({
      user: { id: 'admin-1' },
      roleRow: ADMIN_ROLE,
      cookies: {
        'x-impersonate-org': 'org-123',
        // slug missing
        [ADMIN_ACTIVE_CLIENT_COOKIE]: 'cookie-id',
      },
      clientById: NIKE,
    });
    const result = await getActiveBrand();
    expect(result.brand).toEqual(NIKE);
    expect(result.source).toBe('cookie');
    expect(result.isAdmin).toBe(true);
  });

  it('falls through to the normal admin path when impersonation target is no longer valid', async () => {
    // Pin: stale impersonation cookies (deleted target client) must not
    // strand the owner. The exit-impersonation banner clears them later.
    setup({
      user: { id: 'admin-1' },
      roleRow: ADMIN_ROLE,
      cookies: {
        'x-impersonate-org': 'org-123',
        'x-impersonate-slug': 'gone',
        [ADMIN_ACTIVE_CLIENT_COOKIE]: 'cookie-id',
      },
      impersonatedClient: null,
      clientById: NIKE,
    });
    const result = await getActiveBrand();
    expect(result.brand).toEqual(NIKE);
    expect(result.source).toBe('cookie');
    expect(result.isAdmin).toBe(true);
  });

  it('treats whitespace-only impersonation cookies as unset', async () => {
    setup({
      user: { id: 'admin-1' },
      roleRow: ADMIN_ROLE,
      cookies: {
        'x-impersonate-org': '   ',
        'x-impersonate-slug': '   ',
        [ADMIN_ACTIVE_CLIENT_COOKIE]: 'cookie-id',
      },
      clientById: NIKE,
    });
    const result = await getActiveBrand();
    expect(result.isAdmin).toBe(true);
    expect(result.source).toBe('cookie');
  });
});

describe('listAdminAccessibleBrands', () => {
  it('returns [] when there is no user', async () => {
    setup({ user: null, roleRow: null });
    const result = await listAdminAccessibleBrands();
    expect(result).toEqual([]);
  });

  it('returns [] for non-admin viewers (defense in depth)', async () => {
    // Pin: even though the roster-visibility query has its own filters,
    // viewers must short-circuit BEFORE any clients select runs. A
    // regression that returned the unfiltered list to viewers would
    // expose the agency portfolio.
    setup({ user: { id: 'viewer-1' }, roleRow: VIEWER_ROLE });
    const result = await listAdminAccessibleBrands();
    expect(result).toEqual([]);
    expect(selectClientsWithRosterVisibility).not.toHaveBeenCalled();
  });

  it('returns the roster-visibility result for admins', async () => {
    setup({
      user: { id: 'admin-1' },
      roleRow: ADMIN_ROLE,
      accessibleBrands: [ADIDAS, NIKE],
    });
    const result = await listAdminAccessibleBrands();
    expect(result).toEqual([ADIDAS, NIKE]);
  });

  it('returns [] when the roster query returns null data', async () => {
    // Defensive: `data ?? []`. A regression that returned `data` directly
    // would leak `null` into ~50 callers that destructure or `.map()` it.
    setup({ user: { id: 'admin-1' }, roleRow: ADMIN_ROLE, accessibleBrands: undefined });
    const result = await listAdminAccessibleBrands();
    expect(result).toEqual([]);
  });

  it('queries with onlyActive:true and orders by name ascending', async () => {
    // Pin: the alphabetical order is what makes the first-access fallback
    // deterministic. A regression to default order would surface a
    // different brand each deploy depending on insert order.
    setup({ user: { id: 'admin-1' }, roleRow: ADMIN_ROLE, accessibleBrands: [] });
    await listAdminAccessibleBrands();
    expect(selectClientsWithRosterVisibility).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        onlyActive: true,
        orderBy: { column: 'name', ascending: true },
      }),
    );
  });
});

describe('module exports', () => {
  it('exports the cookie name as a stable string', () => {
    expect(ADMIN_ACTIVE_CLIENT_COOKIE).toBe('x-admin-active-client');
  });
});
