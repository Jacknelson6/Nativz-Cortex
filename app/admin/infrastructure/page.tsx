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
import { AiProvidersTab } from '@/components/admin/infrastructure/tabs/ai-providers-tab';
import { CronsTab } from '@/components/admin/infrastructure/tabs/crons-tab';
import { IntegrationsTab } from '@/components/admin/infrastructure/tabs/integrations-tab';
import { DatabaseTab } from '@/components/admin/infrastructure/tabs/database-tab';

// Auth must run per-request (otherwise non-admins could hit a cached admin
// page response). Each tab wraps its own expensive reads in unstable_cache
// with a 30-60s TTL and the shared INFRA_CACHE_TAG so the "Refresh" server
// action can bust them all at once.
export const dynamic = 'force-dynamic';

const VALID_TABS: readonly InfrastructureTabSlug[] = [
  'overview',
  'topic-search',
  'ai-providers',
  'crons',
  'integrations',
  'database',
];

function resolveTab(raw: string | string[] | undefined): InfrastructureTabSlug {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && (VALID_TABS as readonly string[]).includes(value)) {
    return value as InfrastructureTabSlug;
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
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/admin/dashboard');
  }

  const params = await searchParams;
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
              Platform observability — every subsystem Cortex runs on, rolled up in one place.
              Pick a tab to drill in.
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
    case 'topic-search':
      return <TopicSearchTab />;
    case 'ai-providers':
      return <AiProvidersTab />;
    case 'crons':
      return <CronsTab />;
    case 'integrations':
      return <IntegrationsTab />;
    case 'database':
      return <DatabaseTab />;
  }
}
