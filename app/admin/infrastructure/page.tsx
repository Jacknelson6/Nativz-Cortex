import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  InfrastructureTabs,
  type InfrastructureTabSlug,
} from '@/components/admin/infrastructure/infrastructure-tabs';
import { InfrastructureTabSkeleton } from '@/components/admin/infrastructure/tab-skeleton';
import { ComputeTab } from '@/components/admin/infrastructure/tabs/compute-tab';
import { CostTab } from '@/components/admin/infrastructure/tabs/cost-tab';
import { IntegrationsTab } from '@/components/admin/infrastructure/tabs/integrations-tab';
import { TrendFinderSettingsTab } from '@/components/admin/infrastructure/tabs/trend-finder-settings-tab';

// Auth must run per-request (otherwise non-admins could hit a cached admin
// page response). Each tab wraps its own expensive reads in unstable_cache
// with a 30-60s TTL and the shared INFRA_CACHE_TAG so the "Refresh" server
// action can bust them all at once.
export const dynamic = 'force-dynamic';

const VALID_TABS: readonly InfrastructureTabSlug[] = [
  'compute',
  'cost',
  'trend-finder',
  'integrations',
];

// Legacy slugs → current slug. Keeps bookmarks + the last-tab localStorage
// value from 404ing after the Overview tab was retired, Pipelines was folded
// into Trend finder, and AI + Apify were merged into Cost.
const LEGACY_TAB_ALIASES: Record<string, InfrastructureTabSlug> = {
  overview: 'compute',
  crons: 'compute',
  vercel: 'compute',
  supabase: 'compute',
  database: 'compute',
  ai: 'cost',
  apify: 'cost',
  'ai-providers': 'cost',
  pipelines: 'trend-finder',
  'topic-search': 'trend-finder',
  'search-cost': 'trend-finder',
};

function resolveTab(raw: string | string[] | undefined): InfrastructureTabSlug {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return 'compute';
  if ((VALID_TABS as readonly string[]).includes(value)) {
    return value as InfrastructureTabSlug;
  }
  if (value in LEGACY_TAB_ALIASES) {
    return LEGACY_TAB_ALIASES[value];
  }
  return 'compute';
}

export default async function InfrastructurePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const [{ data: me }, params] = await Promise.all([
    admin.from('users').select('role, is_super_admin').eq('id', user.id).single(),
    searchParams,
  ]);
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/admin/dashboard');
  }

  const activeTab = resolveTab(params.tab);

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-semibold leading-tight text-text-primary">
          Infrastructure
        </h1>
      </header>

      <InfrastructureTabs active={activeTab} />

      {/* `key={activeTab}` forces React to treat each tab as a fresh subtree
         so the Suspense fallback paints the moment the slug changes — the
         previous tab doesn't linger while the new one's awaits resolve. */}
      <Suspense key={activeTab} fallback={<InfrastructureTabSkeleton />}>
        {renderTab(activeTab)}
      </Suspense>
    </div>
  );
}

function renderTab(slug: InfrastructureTabSlug) {
  switch (slug) {
    case 'compute':
      return <ComputeTab />;
    case 'cost':
      return <CostTab />;
    case 'trend-finder':
      return <TrendFinderSettingsTab />;
    case 'integrations':
      return <IntegrationsTab />;
  }
}
