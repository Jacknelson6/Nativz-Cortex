import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface FeatureFlags {
  can_search: boolean;
  can_view_reports: boolean;
}

interface PortalClient {
  id: string;
  name: string;
  slug: string;
  industry: string;
  feature_flags: FeatureFlags;
}

interface PortalClientResult {
  client: PortalClient;
  organizationId: string;
}

export async function getPortalClient(): Promise<PortalClientResult | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const adminClient = createAdminClient();

  const { data: userData } = await adminClient
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!userData?.organization_id) return null;

  const { data: clients } = await adminClient
    .from('clients')
    .select('id, name, slug, industry, feature_flags')
    .eq('organization_id', userData.organization_id)
    .eq('is_active', true)
    .limit(1);

  const client = clients?.[0];
  if (!client) return null;

  const flags = (client.feature_flags as FeatureFlags) || {
    can_search: true,
    can_view_reports: true,
  };

  return {
    client: { ...client, feature_flags: flags },
    organizationId: userData.organization_id,
  };
}
