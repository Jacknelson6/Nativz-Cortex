import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  InfrastructureTabs,
  type InfrastructureTabSlug,
} from '@/components/admin/infrastructure/infrastructure-tabs';
import { RefreshButton } from '@/components/admin/infrastructure/refresh-button';
import { OverviewTab } from '@/components/admin/infrastructure/tabs/overview-tab';
import { TopicSearchTab } from '@/components/admin/infrastructure/tabs/topic-search-tab';
import { ApifyTab } from '@/components/admin/infrastructure/tabs/apify-tab';
import { AiTab } from '@/components/admin/infrastructure/tabs/ai-tab';
import { ComputeTab } from '@/components/admin/infrastructure/tabs/compute-tab';
import { IntegrationsTab } from '@/components/admin/infrastructure/tabs/integrations-tab';
import { SupabaseTab } from '@/components/admin/infrastructure/tabs/supabase-tab';
import { TrendFinderSettingsTab } from '@/components/admin/infrastructure/tabs/trend-finder-settings-tab';

// Auth must run per-request (otherwise non-admins could hit a cached admin
// page response). Each tab wraps its own expensive reads in unstable_cache
// with a 30-60s TTL and the shared INFRA_CACHE_TAG so the "Refresh" server
// action can bust them all at once.
export const dynamic = 'force-dynamic';

const VALID_TABS: readonly InfrastructureTabSlug[] = [
  'overview',
  'compute',
  'database',
  'pipelines',
  'ai',
  'apify',
  'trend-finder',
  'integrations',
];

// Legacy slugs (pre-condensed layout) → current slug. Keeps bookmarks + the
// last-tab localStorage value from 404ing.
const LEGACY_TAB_ALIASES: Record<string, InfrastructureTabSlug> = {
  crons: 'compute',
  vercel: 'compute',
  supabase: 'database',
  'ai-providers': 'ai',
  'topic-search': 'pipelines',
  'search-cost': 'trend-finder',
};

function resolveTab(raw: string | string[] | undefined): InfrastructureTabSlug {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return 'overview';
  if ((VALID_TABS as readonly string[]).includes(value)) {
    return value as InfrastructureTabSlug;
  }
  if (value in LEGACY_TAB_ALIASES) {
    return LEGACY_TAB_ALIASES[value];
  }
  return 'overview';
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
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Cortex · admin
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold leading-tight text-text-primary">
              Infrastructure
            </h1>
            <p className="max-w-2xl text-sm text-text-muted">
              Every backend Cortex runs on, in one place — so you never have to open Vercel,
              Supabase, or Apify to see how we&apos;re doing. Summaries up top, details on tap.
            </p>
          </div>
          <RefreshButton />
        </div>
      </header>

      <InfrastructureTabs active={activeTab} />

      <div>{renderTab(activeTab)}</div>
    </div>
  );
}

function renderTab(slug: InfrastructureTabSlug) {
  switch (slug) {
    case 'overview':
      return <OverviewTab />;
    case 'compute':
      return <ComputeTab />;
    case 'database':
      return <SupabaseTab />;
    case 'pipelines':
      return <TopicSearchTab />;
    case 'ai':
      return <AiTab />;
    case 'apify':
      return <ApifyTab />;
    case 'trend-finder':
      return <TrendFinderSettingsTab />;
    case 'integrations':
      return <IntegrationsTab />;
  }
}
