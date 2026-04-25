import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';

/**
 * Cookie that holds the admin's currently-selected working brand.
 * Parallels the portal's `x-portal-active-client`.
 *
 * SECURITY: The cookie carries only a UUID. Every server read re-authorizes
 * via {@link getActiveBrand} — tampering with the cookie cannot grant access
 * to a brand the user doesn't already have admin rights to.
 */
export const ADMIN_ACTIVE_CLIENT_COOKIE = 'x-admin-active-client';

/**
 * Active-brand record. Field name `AdminBrand` is historical — kept to
 * avoid churn across ~50 callers. Same shape regardless of the resolving
 * user's role; the backing data is whichever client the user currently
 * has selected, scoped by `user_client_access` for viewers and by
 * portfolio access for admins.
 */
export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  agency: string | null;
}

export interface ActiveBrandResult {
  brand: AdminBrand | null;
  /**
   * Where the resolved brand id came from.
   *  - 'url'           — explicit URL param override (admins only)
   *  - 'cookie'        — active-client cookie (admin or viewer)
   *  - 'first-access'  — viewer fallback: first row in user_client_access
   *  - 'none'          — nothing resolved
   */
  source: 'url' | 'cookie' | 'first-access' | 'none';
  /** True when the current user is admin / super_admin. Viewers get a brand
   *  too (resolved via user_client_access) but with isAdmin: false. */
  isAdmin: boolean;
}

async function resolveAdminRole(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();
  if (!data) return false;
  return (
    data.is_super_admin === true ||
    data.role === 'admin' ||
    data.role === 'super_admin'
  );
}

/**
 * Resolve the admin's active working brand.
 *
 * Precedence: explicit `overrideClientId` (URL param) > cookie > none.
 *
 * The optional `overrideClientId` lets pages that accept `?clientId=` or use a
 * `[clientId]` route segment force the server util to resolve that brand
 * instead of the cookie, without writing a new cookie. The caller is expected
 * to read the URL param and pass it in — the util cannot read the URL itself
 * from a pure server function.
 */
export async function getActiveBrand(
  overrideClientId?: string | null,
): Promise<ActiveBrandResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { brand: null, source: 'none', isAdmin: false };
  }

  const isAdmin = await resolveAdminRole(user.id);

  // Phase 2 of the brand-root migration — viewers share the same `(app)`
  // shell as admins, so this util now resolves their active brand too.
  // We delegate to `getActiveViewerBrand` (user_client_access cookie /
  // first row) and return the result with `isAdmin: false`. Pages that
  // care about the role check `result.isAdmin` rather than re-querying.
  if (!isAdmin) {
    const { getActiveViewerBrand } = await import('@/lib/portal/get-viewer-brands');
    const viewer = await getActiveViewerBrand(user.id);
    return { brand: viewer.brand, source: viewer.source, isAdmin: false };
  }

  const cookieStore = await cookies();
  const cookieClientId = cookieStore.get(ADMIN_ACTIVE_CLIENT_COOKIE)?.value ?? null;

  // Impersonation override. When an admin owner has clicked "View as <client>",
  // /api/impersonate sets the slug + organization_id pair. Resolving the
  // impersonated brand here means the shared (app) shell — sidebar pill,
  // brand-profile page, every page that calls `getActiveBrand()` —
  // automatically re-scopes to that client without each page needing its own
  // impersonation check.
  //
  // We also flip `isAdmin: false` while impersonating so every page that
  // gates render on it (e.g. /brand-profile's editor-vs-readonly switch)
  // shows the viewer surface — which is the whole point of impersonating
  // a client. Pages that genuinely need to know "is the underlying user
  // an admin" (impersonation banner, exit button) read the cookies
  // directly via `/api/impersonate/status`.
  const impersonateOrg = cookieStore.get('x-impersonate-org')?.value?.trim() || null;
  const impersonateSlug = cookieStore.get('x-impersonate-slug')?.value?.trim() || null;
  if (impersonateOrg && impersonateSlug) {
    const admin = createAdminClient();
    const { data: impersonated } = await admin
      .from('clients')
      .select('id, name, slug, logo_url, agency')
      .eq('organization_id', impersonateOrg)
      .eq('slug', impersonateSlug)
      .eq('is_active', true)
      .maybeSingle();
    if (impersonated) {
      return { brand: impersonated, source: 'cookie', isAdmin: false };
    }
    // Fall through if the impersonation target is no longer valid; the
    // banner's exit button will clear stale cookies.
  }

  const urlId = overrideClientId?.trim() || null;
  const cookieId = cookieClientId?.trim() || null;
  const candidate = urlId ?? cookieId;
  const source: ActiveBrandResult['source'] = urlId ? 'url' : cookieId ? 'cookie' : 'none';

  if (!candidate) {
    return { brand: null, source: 'none', isAdmin };
  }

  const admin = createAdminClient();
  // NOTE: `hide_from_roster` filter intentionally omitted here. It errors on
  // databases that haven't applied migration 054; more importantly, the
  // cookie value we're validating was written via `/api/admin/active-client`
  // which only accepts brands the current admin can see — no need to
  // re-enforce roster visibility at read time.
  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug, logo_url, agency')
    .eq('id', candidate)
    .eq('is_active', true)
    .maybeSingle();

  if (!client) {
    // Candidate invalid (deleted, deactivated, or tampered cookie) — surface
    // a clean empty state rather than silently falling back to another brand.
    return { brand: null, source: 'none', isAdmin };
  }

  return { brand: client, source, isAdmin };
}

/**
 * List every brand the current admin can switch to, ordered alphabetically.
 *
 * Uses `selectClientsWithRosterVisibility` so databases that haven't yet
 * applied migration 054 (the `hide_from_roster` column) fall through to a
 * no-filter variant instead of silently returning an empty list. The
 * previous hand-rolled filter was the cause of the "No brands available
 * yet" bug in the top-bar pill — Supabase errors the whole query when the
 * column is absent, and the `.eq('hide_from_roster', false)` chain
 * swallowed that error into `data = null`.
 */
export async function listAdminAccessibleBrands(): Promise<AdminBrand[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const isAdmin = await resolveAdminRole(user.id);
  if (!isAdmin) return [];

  const admin = createAdminClient();
  const { data } = await selectClientsWithRosterVisibility<AdminBrand>(admin, {
    select: 'id, name, slug, logo_url, agency',
    onlyActive: true,
    orderBy: { column: 'name', ascending: true },
  });

  return data ?? [];
}
