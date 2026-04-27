import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import {
  AnalyticsLanding,
  type TabId,
  type SubTabId,
} from '@/components/analytics/analytics-landing';
import { getActiveBrand } from '@/lib/active-brand';

const VALID_TABS: readonly TabId[] = ['social', 'affiliates'];
const VALID_SUBS: readonly SubTabId[] = ['overview', 'benchmarking'];

function normalizeTabs(
  rawTab: string | undefined,
  rawSub: string | undefined,
  hasAffiliates: boolean,
): { tab: TabId; sub: SubTabId } {
  // Legacy URL: ?tab=benchmarking → Social / Benchmarking
  if (rawTab === 'benchmarking') {
    return { tab: 'social', sub: 'benchmarking' };
  }
  // Old paid/seo bookmarks fall through to Social rather than 404.
  let tab: TabId = (VALID_TABS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as TabId)
    : 'social';
  // Affiliate URLs land on Social if the client doesn't carry that service.
  if (tab === 'affiliates' && !hasAffiliates) tab = 'social';
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
  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  // Four independent reads — previously serial, which added ~3 round-trips
  // to every analytics page paint. Active-client pill is always fetched so
  // we don't need a trailing await when the URL omits ?clientId=.
  const [
    { clientId, tab, sub },
    { data: clients },
    { data: profiles },
    active,
  ] = await Promise.all([
    searchParams,
    adminClient.from('clients').select('id, name, slug, logo_url, agency, services').order('name'),
    adminClient.from('social_profiles').select('client_id, status'),
    getActiveBrand().catch(() => null),
  ]);

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

  const resolvedInitialClientId =
    clientId?.trim() || active?.brand?.id || null;

  // Affiliates is a client-scoped service: only the brands carrying that
  // contract item see the Affiliates tab. Without it the entire tab strip
  // collapses (Social is the only remaining option, and a one-tab strip is
  // chrome with no purpose).
  const activeClientServices =
    (clients ?? []).find((c) => c.id === resolvedInitialClientId)?.services ?? [];
  const hasAffiliates = Array.isArray(activeClientServices)
    && activeClientServices.includes('Affiliates');

  const { tab: initialTab, sub: initialSub } = normalizeTabs(tab, sub, hasAffiliates);

  return (
    <AnalyticsLanding
      clients={portfolioClients}
      initialClientId={resolvedInitialClientId}
      initialTab={initialTab}
      initialSub={initialSub}
      hasAffiliates={hasAffiliates}
    />
  );
}
