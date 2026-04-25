import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import type { AdminBrand } from '@/lib/active-brand';

/**
 * Brand-root migration phase 2 — viewer-side brand resolution for the
 * shared `(app)` shell. Mirrors `getActiveBrand()` /
 * `listAdminAccessibleBrands()` so both roles produce the same shape that
 * `<ActiveBrandProvider />` and `<AdminBrandPill />` already expect.
 *
 * Resolution precedence:
 *   1. `x-portal-active-client` cookie, validated against `user_client_access`.
 *   2. Fall back to the first row in the user's `user_client_access` list.
 *   3. `null` if the viewer has no client access yet.
 */
const PORTAL_ACTIVE_CLIENT_COOKIE = 'x-portal-active-client';

interface ActiveViewerBrandResult {
  brand: AdminBrand | null;
  source: 'cookie' | 'first-access' | 'none';
}

export async function listViewerAccessibleBrands(userId: string): Promise<AdminBrand[]> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('user_client_access')
    .select('clients(id, name, slug, logo_url, agency, is_active)')
    .eq('user_id', userId);

  type AccessRow = { clients: AdminBrand & { is_active: boolean } | null };
  const brands = ((rows as AccessRow[] | null) ?? [])
    .map((row) => row.clients)
    .filter((c): c is AdminBrand & { is_active: boolean } => !!c && c.is_active === true)
    .map(({ is_active: _is_active, ...rest }) => rest);

  brands.sort((a, b) => a.name.localeCompare(b.name));
  return brands;
}

export async function getActiveViewerBrand(userId: string): Promise<ActiveViewerBrandResult> {
  const cookieStore = await cookies();
  const cookieClientId = cookieStore.get(PORTAL_ACTIVE_CLIENT_COOKIE)?.value?.trim() || null;
  const admin = createAdminClient();

  if (cookieClientId) {
    const { data: access } = await admin
      .from('user_client_access')
      .select('clients(id, name, slug, logo_url, agency, is_active)')
      .eq('user_id', userId)
      .eq('client_id', cookieClientId)
      .maybeSingle();

    type AccessRow = { clients: AdminBrand & { is_active: boolean } | null };
    const client = (access as AccessRow | null)?.clients;
    if (client && client.is_active) {
      const { is_active: _is_active, ...brand } = client;
      return { brand, source: 'cookie' };
    }
    // Cookie pointed at a brand the user no longer has access to — fall through.
  }

  const { data: firstRows } = await admin
    .from('user_client_access')
    .select('clients(id, name, slug, logo_url, agency, is_active)')
    .eq('user_id', userId)
    .limit(1);

  type AccessRow = { clients: AdminBrand & { is_active: boolean } | null };
  const first = (firstRows as AccessRow[] | null)?.[0]?.clients;
  if (first && first.is_active) {
    const { is_active: _is_active, ...brand } = first;
    return { brand, source: 'first-access' };
  }

  return { brand: null, source: 'none' };
}
