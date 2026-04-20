import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import {
  AnalyticsLanding,
  type TabId,
  type SubTabId,
} from '@/components/analytics/analytics-landing';

const VALID_TABS: readonly TabId[] = ['social', 'paid', 'seo', 'affiliates'];
const VALID_SUBS: readonly SubTabId[] = ['overview', 'benchmarking'];

function normalizeTabs(
  rawTab: string | undefined,
  rawSub: string | undefined,
): { tab: TabId; sub: SubTabId } {
  // Legacy URL: ?tab=benchmarking → Social / Benchmarking
  if (rawTab === 'benchmarking') {
    return { tab: 'social', sub: 'benchmarking' };
  }
  const tab = (VALID_TABS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as TabId)
    : 'social';
  const sub = (VALID_SUBS as readonly string[]).includes(rawSub ?? '')
    ? (rawSub as SubTabId)
    : 'overview';
  return { tab, sub };
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; tab?: string; sub?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const { clientId, tab, sub } = await searchParams;
  const adminClient = createAdminClient();

  // Fetch all clients with their social connection status
  const { data: clients } = await adminClient
    .from('clients')
    .select('id, name, slug, logo_url, agency')
    .order('name');

  // Fetch social profiles to determine connection status
  const { data: profiles } = await adminClient
    .from('social_profiles')
    .select('client_id, status');

  // Build connection status map
  const connectionMap: Record<string, 'connected' | 'disconnected' | 'paused'> = {};
  for (const profile of profiles ?? []) {
    if (!profile.client_id) continue;
    const current = connectionMap[profile.client_id];
    if (profile.status === 'active' || profile.status === 'connected') {
      connectionMap[profile.client_id] = 'connected';
    } else if (!current) {
      connectionMap[profile.client_id] = profile.status === 'paused' ? 'paused' : 'disconnected';
    }
  }

  const portfolioClients = (clients ?? []).map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    logo_url: c.logo_url,
    agency: c.agency,
    connectionStatus: (connectionMap[c.id] ?? 'disconnected') as 'connected' | 'disconnected' | 'paused',
  }));

  const { tab: initialTab, sub: initialSub } = normalizeTabs(tab, sub);

  return (
    <AnalyticsLanding
      clients={portfolioClients}
      initialClientId={clientId?.trim() ?? null}
      initialTab={initialTab}
      initialSub={initialSub}
    />
  );
}
