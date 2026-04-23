import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { OnboardingRosterTable } from '@/components/onboarding/onboarding-roster-table';
import {
  SectionTabs,
  SectionHeader,
  SectionPanel,
} from '@/components/admin/section-tabs';
import {
  ONBOARDING_TABS,
  ONBOARDING_TAB_SLUGS,
  type OnboardingTabSlug,
} from '@/components/admin/onboarding/onboarding-tabs';
import { OnboardingOverviewTab } from '@/components/admin/onboarding/overview-tab';
import { RefreshButton } from '@/components/admin/shared/refresh-button';
import { refreshOnboarding } from './actions';

export const dynamic = 'force-dynamic';

type TrackerRow = {
  id: string;
  client_id: string | null;
  service: string;
  title: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  is_template: boolean;
  template_name: string | null;
  created_at: string;
  clients: { name: string; slug: string; logo_url: string | null } | null;
};

function resolveTab(raw: string | undefined): OnboardingTabSlug {
  if (raw && (ONBOARDING_TAB_SLUGS as readonly string[]).includes(raw)) {
    return raw as OnboardingTabSlug;
  }
  return 'overview';
}

/**
 * /admin/onboarding — top-level admin page for every onboarding tracker
 * across clients. Tabbed to match the Infrastructure page pattern.
 *
 * Legacy ?view=templates query keeps working by redirecting once.
 */
export default async function OnboardingRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; view?: string }>;
}) {
  const sp = await searchParams;

  // Back-compat: legacy ?view=templates → ?tab=templates
  if (sp.view === 'templates' && !sp.tab) {
    redirect('/admin/onboarding?tab=templates');
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') notFound();

  const activeTab = resolveTab(sp.tab);

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <SectionHeader
        title="Onboarding"
        description="Per-service setup for every client — checklist + timeline + shareable client view. Pick a tab to drill in."
        action={<RefreshButton action={refreshOnboarding} />}
      />

      <SectionTabs tabs={ONBOARDING_TABS} active={activeTab} memoryKey="cortex:onboarding:last-tab" />

      <div>{await renderTab(activeTab, admin)}</div>
    </div>
  );
}

async function renderTab(slug: OnboardingTabSlug, admin: ReturnType<typeof createAdminClient>): Promise<React.ReactNode> {
  switch (slug) {
    case 'overview':
      return <OnboardingOverviewTab />;
    case 'trackers':
      return <TrackersOrTemplatesTab admin={admin} mode="trackers" />;
    case 'templates':
      return <TrackersOrTemplatesTab admin={admin} mode="templates" />;
    case 'email-templates':
      return <EmailTemplatesTab />;
  }
}

async function TrackersOrTemplatesTab({
  admin,
  mode,
}: {
  admin: ReturnType<typeof createAdminClient>;
  mode: 'trackers' | 'templates';
}) {
  const [{ data: trackersRaw }, { data: clientsRaw }] = await Promise.all([
    admin
      .from('onboarding_trackers')
      .select('id, client_id, service, title, status, started_at, completed_at, is_template, template_name, created_at, clients(name, slug, logo_url)')
      .eq('is_template', mode === 'templates')
      .order('created_at', { ascending: false }),
    admin
      .from('clients')
      .select('id, name, slug, services')
      .order('name', { ascending: true }),
  ]);

  const trackers = (trackersRaw as TrackerRow[] | null) ?? [];
  const clients = (clientsRaw ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
    services: Array.isArray(c.services) ? (c.services as string[]) : [],
  }));

  // Aggregate child counts for preview badges.
  const trackerIds = trackers.map((t) => t.id);
  let stats: Record<string, { phases: number; groups: number; items: number }> = {};
  if (trackerIds.length > 0) {
    const [phasesRes, groupsRes] = await Promise.all([
      admin
        .from('onboarding_phases')
        .select('tracker_id')
        .in('tracker_id', trackerIds),
      admin
        .from('onboarding_checklist_groups')
        .select('id, tracker_id')
        .in('tracker_id', trackerIds),
    ]);

    const phaseRows = (phasesRes.data ?? []) as { tracker_id: string }[];
    const groupRows = (groupsRes.data ?? []) as { id: string; tracker_id: string }[];
    const groupToTracker = new Map(groupRows.map((g) => [g.id, g.tracker_id]));

    const itemsRes = groupRows.length
      ? await admin
          .from('onboarding_checklist_items')
          .select('group_id')
          .in('group_id', groupRows.map((g) => g.id))
      : { data: [] as { group_id: string }[] };
    const itemRows = (itemsRes.data ?? []) as { group_id: string }[];

    stats = Object.fromEntries(
      trackerIds.map((id) => [id, { phases: 0, groups: 0, items: 0 }]),
    );
    for (const p of phaseRows) {
      if (stats[p.tracker_id]) stats[p.tracker_id].phases += 1;
    }
    for (const g of groupRows) {
      if (stats[g.tracker_id]) stats[g.tracker_id].groups += 1;
    }
    for (const it of itemRows) {
      const tid = groupToTracker.get(it.group_id);
      if (tid && stats[tid]) stats[tid].items += 1;
    }
  }

  return (
    <SectionPanel
      title={mode === 'templates' ? 'Service templates' : 'Active trackers'}
      description={
        mode === 'templates'
          ? 'Reusable onboarding presets per service. Clone into a tracker on assignment.'
          : 'Live onboarding in flight across every client.'
      }
    >
      <OnboardingRosterTable trackers={trackers} clients={clients} view={mode} stats={stats} />
    </SectionPanel>
  );
}

function EmailTemplatesTab() {
  return (
    <SectionPanel
      title="Email templates"
      description="Shared templates used by the onboarding email composer."
    >
      <a
        href="/admin/onboarding/email-templates"
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent-text transition-colors hover:border-accent/60 hover:bg-accent/20"
      >
        Open email templates →
      </a>
    </SectionPanel>
  );
}
