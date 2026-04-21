import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';

/**
 * Cookie that holds the admin's currently-selected working brand.
 * Parallels the portal's `x-portal-active-client`.
 *
 * SECURITY: The cookie carries only a UUID. Every server read re-authorizes
 * via {@link getActiveAdminClient} — tampering with the cookie cannot grant
 * access to a brand the user doesn't already have admin rights to.
 */
export const ADMIN_ACTIVE_CLIENT_COOKIE = 'x-admin-active-client';

export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  agency: string | null;
}

export interface ActiveAdminClientResult {
  brand: AdminBrand | null;
  /** Where the resolved brand id came from. "none" = no selection. */
  source: 'url' | 'cookie' | 'none';
  /** True when the current user is admin / super_admin. Non-admins get no brand. */
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
export async function getActiveAdminClient(
  overrideClientId?: string | null,
): Promise<ActiveAdminClientResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { brand: null, source: 'none', isAdmin: false };
  }

  const isAdmin = await resolveAdminRole(user.id);
  if (!isAdmin) {
    return { brand: null, source: 'none', isAdmin: false };
  }

  const cookieStore = await cookies();
  const cookieClientId = cookieStore.get(ADMIN_ACTIVE_CLIENT_COOKIE)?.value ?? null;

  const urlId = overrideClientId?.trim() || null;
  const cookieId = cookieClientId?.trim() || null;
  const candidate = urlId ?? cookieId;
  const source: ActiveAdminClientResult['source'] = urlId ? 'url' : cookieId ? 'cookie' : 'none';

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
