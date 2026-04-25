import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  InfrastructureTabs,
  type InfrastructureTabSlug,
} from '@/components/admin/infrastructure/infrastructure-tabs';
import { InfrastructureTabSkeleton } from '@/components/admin/infrastructure/tab-skeleton';
import { CostTab } from '@/components/admin/infrastructure/tabs/cost-tab';
import { SearchRunsTab } from '@/components/admin/infrastructure/tabs/search-runs-tab';

// Auth must run per-request (otherwise non-admins could hit a cached admin
// page response). Each tab wraps its own expensive reads in unstable_cache
// with a 30-60s TTL and the shared INFRA_CACHE_TAG so the "Refresh" server
// action can bust them all at once.
export const dynamic = 'force-dynamic';

const VALID_TABS: readonly InfrastructureTabSlug[] = [
  'cost',
  'search-runs',
];

// Legacy slugs → current slug. Keeps bookmarks + the last-tab localStorage
// value from 404ing after the tab restructure on 2026-04-24. Safe to prune
// any alias whose "added" date is older than ~30 days — by then the
// localStorage value on every active admin will have rotated to a live slug.
// Prune candidates (next cleanup ≥ 2026-05-24):
//   overview, crons, compute, vercel, supabase, database, ai, apify,
//   ai-providers, integrations, pipelines, topic-search, search-cost,
//   trend-finder (moved to /admin/settings?tab=trend-finder)
const LEGACY_TAB_ALIASES: Record<string, string> = {
  overview: 'cost',
  crons: 'cost',
  compute: 'cost',
  vercel: 'cost',
  supabase: 'cost',
  database: 'cost',
  ai: 'cost',
  apify: 'cost',
  'ai-providers': 'cost',
  integrations: 'cost',
  pipelines: 'search-runs',
  'topic-search': 'search-runs',
  'search-cost': 'search-runs',
  'trend-finder': '__settings__',
};

function resolveTab(raw: string | string[] | undefined): InfrastructureTabSlug | 'redirect-to-settings' {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return 'cost';
  if ((VALID_TABS as readonly string[]).includes(value)) {
    return value as InfrastructureTabSlug;
  }
  const aliased = LEGACY_TAB_ALIASES[value];
  if (aliased === '__settings__') return 'redirect-to-settings';
  if (aliased) return aliased as InfrastructureTabSlug;
  return 'cost';
}

export default async function InfrastructurePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; preset?: string; from?: string; to?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [{ data: me }, params] = await Promise.all([
    admin.from('users').select('role, is_super_admin').eq('id', user.id).single(),
    searchParams,
  ]);
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/admin/dashboard');
  }

  const resolved = resolveTab(params.tab);
  if (resolved === 'redirect-to-settings') {
    redirect('/admin/settings?tab=trend-finder');
  }
  const activeTab = resolved;
  // The date-range query params (preset/from/to) key the Suspense subtree
  // too, so switching range triggers the skeleton alongside tab switches.
  const rangeKey = `${params.preset ?? ''}:${params.from ?? ''}:${params.to ?? ''}`;

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-semibold leading-tight text-text-primary">
          Usage
        </h1>
      </header>

      <InfrastructureTabs active={activeTab} />

      {/* `key={activeTab:rangeKey}` forces React to treat each tab and
         each range change as a fresh subtree so the Suspense fallback
         paints the moment either slug changes. */}
      <Suspense key={`${activeTab}:${rangeKey}`} fallback={<InfrastructureTabSkeleton />}>
        {renderTab(activeTab, params)}
      </Suspense>
    </div>
  );
}

function renderTab(
  slug: InfrastructureTabSlug,
  params: { preset?: string; from?: string; to?: string },
) {
  switch (slug) {
    case 'cost':
      return <CostTab preset={params.preset} from={params.from} to={params.to} />;
    case 'search-runs':
      return <SearchRunsTab preset={params.preset} from={params.from} to={params.to} />;
  }
}
