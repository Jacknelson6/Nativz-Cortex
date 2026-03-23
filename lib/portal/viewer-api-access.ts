import { createAdminClient } from '@/lib/supabase/admin';
import { buildPortalFeatureFlags } from '@/lib/portal/feature-flags';

/**
 * Clients a portal user can access (for API access policy). Admins: empty (caller treats as bypass).
 */
export async function listViewerAccessibleClientFlags(userId: string): Promise<unknown[]> {
  const admin = createAdminClient();
  const { data: userRow } = await admin.from('users').select('role, organization_id').eq('id', userId).single();
  if (!userRow || userRow.role === 'admin') {
    return [];
  }

  const { data: accessRows } = await admin
    .from('user_client_access')
    .select('client_id')
    .eq('user_id', userId);

  if (accessRows && accessRows.length > 0) {
    const ids = accessRows.map((r) => r.client_id);
    const { data: clients } = await admin
      .from('clients')
      .select('feature_flags')
      .in('id', ids)
      .eq('is_active', true);
    return (clients ?? []).map((c) => c.feature_flags);
  }

  if (userRow.organization_id) {
    const { data: clients } = await admin
      .from('clients')
      .select('feature_flags')
      .eq('organization_id', userRow.organization_id)
      .eq('is_active', true);
    return (clients ?? []).map((c) => c.feature_flags);
  }

  return [];
}

/**
 * Admins always allowed. Viewers allowed only if every accessible client permits API (`can_use_api` not false).
 */
export async function viewerMayUseRestApi(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: userRow } = await admin.from('users').select('role').eq('id', userId).single();
  if (!userRow) return false;
  if (userRow.role === 'admin') return true;

  const flagRows = await listViewerAccessibleClientFlags(userId);
  if (flagRows.length === 0) return false;

  return flagRows.every((raw) => buildPortalFeatureFlags(raw).can_use_api !== false);
}
