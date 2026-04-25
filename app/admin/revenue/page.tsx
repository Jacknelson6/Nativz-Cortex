import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionHeader, SectionPanel, SectionTabs } from '@/components/admin/section-tabs';
import {
  REVENUE_TABS,
  REVENUE_TAB_SLUGS,
  type RevenueTabSlug,
} from '@/components/admin/revenue/revenue-tabs';
import { RevenueOverviewTab } from '@/components/admin/revenue/overview-tab';
import { InvoicesTable } from '@/components/admin/revenue/invoices-table';
import { RevenueSubscriptionsTab } from '@/components/admin/revenue/subscriptions-tab';
import { RevenueClientsTab } from '@/components/admin/revenue/clients-tab';
import { AdSpendTab } from '@/components/admin/revenue/ad-spend-tab';
import { RevenueActivityTab } from '@/components/admin/revenue/activity-tab';
import { AnomaliesTab } from '@/components/admin/revenue/anomalies-tab';
import { QuickBooksExportButton } from '@/components/admin/revenue/qb-export-button';

export const dynamic = 'force-dynamic';

function resolveTab(raw: string | undefined): RevenueTabSlug {
  if (raw && (REVENUE_TAB_SLUGS as readonly string[]).includes(raw)) {
    return raw as RevenueTabSlug;
  }
  return 'overview';
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
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
  const isAdmin =
    me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) redirect('/admin/dashboard');

  const activeTab = resolveTab(params.tab);

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <SectionHeader
        title="Revenue"
        description="MRR, AR, Stripe invoices, contracts, ad spend, and the lifecycle loop from signed contract through active client."
        action={<QuickBooksExportButton />}
      />
      <SectionTabs tabs={REVENUE_TABS} active={activeTab} memoryKey="cortex:revenue:last-tab" />

      <SectionPanel>
        {activeTab === 'overview' ? <RevenueOverviewTab /> : null}
        {activeTab === 'invoices' ? <InvoicesTable /> : null}
        {activeTab === 'subscriptions' ? <RevenueSubscriptionsTab /> : null}
        {activeTab === 'clients' ? <RevenueClientsTab /> : null}
        {activeTab === 'ad-spend' ? <AdSpendClientLoader /> : null}
        {activeTab === 'activity' ? <RevenueActivityTab /> : null}
        {activeTab === 'anomalies' ? <AnomaliesTab /> : null}
      </SectionPanel>
    </div>
  );
}

async function AdSpendClientLoader() {
  const admin = createAdminClient();
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('hide_from_roster', false)
    .order('name', { ascending: true });
  const options = (clients ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? 'Unnamed',
    slug: c.slug ?? '',
  }));
  return <AdSpendTab clients={options} />;
}
