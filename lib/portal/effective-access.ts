import { cookies } from 'next/headers';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Effective access context for the caller.
 *
 * Why this exists: admin impersonation previously only influenced the
 * page-level `getPortalClient()` result, not API routes that independently
 * read `users.role`. So a super_admin impersonating Avondale still hit
 * admin-bypass paths on `/api/research/history`, `/api/moodboard/notes-
 * boards`, `/api/nerd/mentions`, etc., and those routes happily returned
 * cross-client data.
 *
 * This helper collapses that to a single source of truth:
 *   - real admin (no impersonation cookie) → role='admin', unrestricted.
 *   - admin impersonating client X         → role='viewer', scoped to X's
 *                                            org, clientIds=[X] (or the
 *                                            org's active clients when
 *                                            no slug is set).
 *   - real viewer                           → role='viewer', scoped to
 *                                            their user_client_access.
 *
 * Route handlers should prefer this over ad-hoc `userData.role === 'admin'`
 * + `users.organization_id` lookups so impersonation is always honored.
 */
export interface EffectiveAccessContext {
  userId: string;
  role: 'admin' | 'viewer';
  /** True when a real admin / super_admin is currently impersonating. */
  isImpersonating: boolean;
  /** Real DB role, regardless of impersonation. Use only for audit /
   *  "acting as" UI — never for authorization decisions. */
  underlyingRole: 'admin' | 'super_admin' | 'viewer' | null;
  /** The org the caller is effectively viewing. For real admins without
   *  impersonation this is null (they see all orgs). */
  organizationId: string | null;
  /** The exact set of client_ids the caller is effectively scoped to.
   *  Null means "no restriction" (real admin not impersonating). */
  clientIds: string[] | null;
  /** When impersonating, the single client selected by slug + org. */
  impersonatedClientId: string | null;
}

export async function getEffectiveAccessContext(
  userOrId: User | string,
  adminClient: SupabaseClient,
): Promise<EffectiveAccessContext> {
  // Tool handlers only have the user id (passed in from the chat route's
  // auth resolution) — accept either a full User or a bare id string.
  const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;

  const { data: userRow } = await adminClient
    .from('users')
    .select('role, organization_id, is_super_admin')
    .eq('id', userId)
    .single();

  const underlyingRole: 'admin' | 'super_admin' | 'viewer' | null =
    (userRow?.is_super_admin === true && 'super_admin') ||
    (userRow?.role as 'admin' | 'viewer' | null) ||
    null;

  const realIsAdmin =
    userRow?.is_super_admin === true ||
    userRow?.role === 'admin' ||
    userRow?.role === 'super_admin';

  const cookieStore = await cookies();
  const impersonateOrgId = cookieStore.get('x-impersonate-org')?.value || null;
  const impersonateSlug = cookieStore.get('x-impersonate-slug')?.value?.trim() || null;

  if (realIsAdmin && impersonateOrgId) {
    // Resolve the impersonated client(s). Slug narrows to one brand; no
    // slug lets the caller act across every active brand in the org.
    let clientIds: string[] = [];
    let impersonatedClientId: string | null = null;

    if (impersonateSlug) {
      const { data: client } = await adminClient
        .from('clients')
        .select('id')
        .eq('organization_id', impersonateOrgId)
        .eq('is_active', true)
        .eq('slug', impersonateSlug)
        .maybeSingle();
      if (client?.id) {
        clientIds = [client.id as string];
        impersonatedClientId = client.id as string;
      }
    }

    if (clientIds.length === 0) {
      const { data: orgClients } = await adminClient
        .from('clients')
        .select('id')
        .eq('organization_id', impersonateOrgId)
        .eq('is_active', true);
      clientIds = (orgClients ?? []).map((c) => c.id as string);
      if (clientIds.length === 1) impersonatedClientId = clientIds[0];
    }

    return {
      userId: userId,
      role: 'viewer',
      isImpersonating: true,
      underlyingRole,
      organizationId: impersonateOrgId,
      clientIds,
      impersonatedClientId,
    };
  }

  if (realIsAdmin) {
    return {
      userId: userId,
      role: 'admin',
      isImpersonating: false,
      underlyingRole,
      organizationId: null,
      clientIds: null,
      impersonatedClientId: null,
    };
  }

  // Real viewer — scope to their user_client_access list.
  const { data: access } = await adminClient
    .from('user_client_access')
    .select('client_id')
    .eq('user_id', userId);

  const clientIds = (access ?? []).map((r) => r.client_id as string);

  return {
    userId: userId,
    role: 'viewer',
    isImpersonating: false,
    underlyingRole,
    organizationId: (userRow?.organization_id as string | null) ?? null,
    clientIds,
    impersonatedClientId: null,
  };
}

/**
 * Narrow a caller-supplied `clientId` against the effective scope. Returns
 * null when the caller has no legitimate access to the requested client
 * (route handlers should 403 / return empty).
 */
export function resolveScopedClientId(
  ctx: EffectiveAccessContext,
  requestedClientId: string | null,
): string | null | 'deny' {
  if (ctx.role === 'admin' && !ctx.isImpersonating) return requestedClientId;
  if (!requestedClientId) return ctx.impersonatedClientId ?? null;
  if (ctx.clientIds && ctx.clientIds.includes(requestedClientId)) return requestedClientId;
  return 'deny';
}
