/**
 * Shared helper to enforce org scoping on client-facing API routes.
 * Any route that takes a client_id and uses createAdminClient() MUST
 * call this to verify the authenticated user has access.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserOrganizationIdsForAccess } from '@/lib/api/topic-search-access';

export interface ClientAccessResult {
  isAdmin: boolean;
  /** The user's accessible organization IDs (viewer only) */
  orgIds: string[];
  userId: string;
  role: string;
}

/**
 * Check if the authenticated user can access a specific client's data.
 * - Admins: always allowed
 * - Viewers: only if the client's organization_id is in the user's org set
 *
 * Returns { allowed: true } or { allowed: false, status, error }.
 */
export async function assertUserCanAccessClient(
  adminClient: SupabaseClient,
  userId: string,
  clientId: string,
): Promise<{ allowed: true } | { allowed: false; status: number; error: string }> {
  const { data: userData } = await adminClient
    .from('users')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();

  const isAdmin =
    userData?.is_super_admin === true ||
    userData?.role === 'admin' ||
    userData?.role === 'super_admin';

  if (isAdmin) return { allowed: true };

  if (userData?.role !== 'viewer') {
    return { allowed: false, status: 403, error: 'Access denied' };
  }

  // Verify the client's org is in the viewer's accessible orgs
  const { data: client } = await adminClient
    .from('clients')
    .select('organization_id')
    .eq('id', clientId)
    .maybeSingle();

  if (!client?.organization_id) {
    return { allowed: false, status: 404, error: 'Client not found' };
  }

  const orgIds = await getUserOrganizationIdsForAccess(adminClient, userId);
  if (!orgIds.includes(client.organization_id as string)) {
    return { allowed: false, status: 403, error: 'Access denied' };
  }

  return { allowed: true };
}

/**
 * Get the user's role info for quick admin checks.
 */
export async function getUserRoleInfo(
  adminClient: SupabaseClient,
  userId: string,
): Promise<{ isAdmin: boolean; role: string | null; orgIds: string[] }> {
  const { data: userData } = await adminClient
    .from('users')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();

  const isAdmin =
    userData?.is_super_admin === true ||
    userData?.role === 'admin' ||
    userData?.role === 'super_admin';

  if (isAdmin) {
    return { isAdmin: true, role: userData?.role ?? null, orgIds: [] };
  }

  const orgIds = await getUserOrganizationIdsForAccess(adminClient, userId);
  return { isAdmin: false, role: userData?.role ?? null, orgIds };
}

/**
 * Verify a client_id is accessible to the user, returning the org check result.
 * For use in routes that accept client_id as a query/body parameter.
 */
export async function scopeClientIdForUser(
  adminClient: SupabaseClient,
  userId: string,
  clientId: string | null | undefined,
): Promise<{ allowed: true; clientId: string } | { allowed: false; status: number; error: string }> {
  if (!clientId) {
    return { allowed: false, status: 400, error: 'client_id is required' };
  }

  const access = await assertUserCanAccessClient(adminClient, userId, clientId);
  if (!access.allowed) return access;

  return { allowed: true, clientId };
}
