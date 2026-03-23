import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import type { ClientPreferences } from '@/lib/types/database';
import { buildPortalFeatureFlags, type FeatureFlags } from '@/lib/portal/feature-flags';

interface PortalClient {
  id: string;
  name: string;
  slug: string;
  industry: string;
  feature_flags: FeatureFlags;
  preferences: ClientPreferences | null;
}

interface PortalClientResult {
  client: PortalClient;
  organizationId: string;
}

export type { FeatureFlags, PortalClient, PortalClientResult };

function toPortalClientResult(
  client: { id: string; name: string; slug: string; industry: string; feature_flags: unknown; preferences: unknown },
  organizationId: string,
): PortalClientResult {
  return {
    client: {
      ...client,
      feature_flags: buildPortalFeatureFlags(client.feature_flags),
      preferences: client.preferences as ClientPreferences | null,
    },
    organizationId,
  };
}

export async function getPortalClient(): Promise<PortalClientResult | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const adminClient = createAdminClient();
  const cookieStore = await cookies();

  // ── 1. Admin impersonation (highest priority) ────────────────────────────
  const impersonateOrgId = cookieStore.get('x-impersonate-org')?.value;

  if (impersonateOrgId) {
    const { data: adminUser } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminUser?.role === 'admin') {
      const { data: clients } = await adminClient
        .from('clients')
        .select('id, name, slug, industry, feature_flags, preferences')
        .eq('organization_id', impersonateOrgId)
        .eq('is_active', true)
        .limit(1);

      const client = clients?.[0];
      if (!client) return null;

      return toPortalClientResult(client, impersonateOrgId);
    }
  }

  // ── 2. Active client cookie (multi-brand switcher) ───────────────────────
  const activeClientId = cookieStore.get('x-portal-active-client')?.value;

  if (activeClientId) {
    const { data: access } = await adminClient
      .from('user_client_access')
      .select('client_id, organization_id')
      .eq('user_id', user.id)
      .eq('client_id', activeClientId)
      .single();

    if (access) {
      const { data: client } = await adminClient
        .from('clients')
        .select('id, name, slug, industry, feature_flags, preferences')
        .eq('id', access.client_id)
        .eq('is_active', true)
        .single();

      if (client) {
        return toPortalClientResult(client, access.organization_id);
      }
    }
  }

  // ── 3. Default: first accessible client from user_client_access ──────────
  const { data: accessRows } = await adminClient
    .from('user_client_access')
    .select('client_id, organization_id')
    .eq('user_id', user.id)
    .limit(1);

  if (accessRows && accessRows.length > 0) {
    const firstAccess = accessRows[0];
    const { data: client } = await adminClient
      .from('clients')
      .select('id, name, slug, industry, feature_flags, preferences')
      .eq('id', firstAccess.client_id)
      .eq('is_active', true)
      .single();

    if (client) {
      return toPortalClientResult(client, firstAccess.organization_id);
    }
  }

  // ── 4. Legacy fallback: user.organization_id (pre-migration users) ───────
  const { data: userData } = await adminClient
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!userData?.organization_id) return null;

  const { data: clients } = await adminClient
    .from('clients')
    .select('id, name, slug, industry, feature_flags, preferences')
    .eq('organization_id', userData.organization_id)
    .eq('is_active', true)
    .limit(1);

  const client = clients?.[0];
  if (!client) return null;

  return toPortalClientResult(client, userData.organization_id);
}
