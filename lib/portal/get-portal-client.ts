import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ClientPreferences } from '@/lib/types/database';

interface FeatureFlags {
  can_search: boolean;
  can_view_reports: boolean;
  can_edit_preferences: boolean;
  can_submit_ideas: boolean;
}

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

export async function getPortalClient(): Promise<PortalClientResult | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const adminClient = createAdminClient();

  // Single query: join users + clients to avoid waterfall
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

  const flags = (client.feature_flags as FeatureFlags) || {
    can_search: true,
    can_view_reports: true,
    can_edit_preferences: false,
    can_submit_ideas: false,
  };

  return {
    client: { ...client, feature_flags: flags, preferences: client.preferences as ClientPreferences | null },
    organizationId: userData.organization_id,
  };
}
