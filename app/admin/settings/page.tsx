import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  SectionTabs,
  SectionHeader,
  SectionPanel,
} from '@/components/admin/section-tabs';
import {
  AI_SETTINGS_TABS,
  AI_SETTINGS_TAB_SLUGS,
  type AiSettingsTabSlug,
} from '@/components/admin/ai-settings/ai-settings-tabs';
import { RefreshButton } from '@/components/admin/shared/refresh-button';
import { refreshAiSettings } from './actions';
import { AiRoutingSection } from '@/components/settings/ai-routing-section';
import { LlmCredentialsSection } from '@/components/settings/llm-credentials-section';
import { ScraperVolumesSection } from '@/components/settings/scraper-volumes-section';
import { NotificationsTabContent } from '@/components/admin/settings/notifications-tab-content';
import type { EmailHubClientOption } from '@/components/tools/email-hub/email-hub-client';
import { AISettingsSkillsPanel } from './skills-panel';
import { NOTIFICATION_REGISTRY } from '@/lib/notifications/registry';

export const dynamic = 'force-dynamic';

/**
 * Admin Settings — the levers that configure Cortex. Two tabs:
 *   • AI — model, API key, and skills, stacked. (Was three separate
 *     tabs until 2026-04-26.)
 *   • Trend finder — per-platform scrape volumes.
 *
 * Personal account settings moved to /admin/account on 2026-04-24.
 * Overview, Search cost, and Usage tabs were retired and moved to
 * /admin/usage. Legacy slugs redirect.
 */
const LEGACY_REDIRECTS: Record<string, string> = {
  overview: '/admin/settings',
  'search-cost': '/admin/usage?tab=trend-finder',
  usage: '/admin/usage?tab=cost',
  model: '/admin/settings?tab=ai',
  credentials: '/admin/settings?tab=ai',
  skills: '/admin/settings?tab=ai',
};

export default async function AISettingsPage({
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
  const [{ data: me }, { data: clients }, { data: emailHubClientRows }, params] = await Promise.all([
    admin.from('users').select('role, is_super_admin').eq('id', user.id).single(),
    admin.from('clients').select('id, name, slug').eq('is_active', true).order('name'),
    admin.from('clients').select('id, name, agency').order('name', { ascending: true }),
    searchParams,
  ]);
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/admin/dashboard');
  }

  const rawTab = params.tab ?? '';
  if (rawTab && rawTab in LEGACY_REDIRECTS && LEGACY_REDIRECTS[rawTab] !== '/admin/settings') {
    redirect(LEGACY_REDIRECTS[rawTab]);
  }

  const activeTab = resolveTab(rawTab);
  const emailHubClients: EmailHubClientOption[] = (emailHubClientRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    agency: c.agency ?? null,
  }));

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <SectionHeader
        title="Settings"
        description="Model, key, and skills in one place. Usage and search cost live under the Usage page."
        action={<RefreshButton action={refreshAiSettings} />}
      />

      <SectionTabs tabs={AI_SETTINGS_TABS} active={activeTab} memoryKey="cortex:ai-settings:last-tab" />

      <div>{renderTab(activeTab, clients ?? [], emailHubClients)}</div>
    </div>
  );
}

function resolveTab(raw: string | undefined): AiSettingsTabSlug {
  if (raw && (AI_SETTINGS_TAB_SLUGS as readonly string[]).includes(raw)) {
    return raw as AiSettingsTabSlug;
  }
  return 'ai';
}

function renderTab(
  slug: AiSettingsTabSlug,
  clients: Array<{ id: string; name: string; slug: string }>,
  emailHubClients: EmailHubClientOption[],
): React.ReactNode {
  switch (slug) {
    case 'ai':
      return (
        <div className="space-y-10">
          <AiRoutingSection />
          <LlmCredentialsSection />
          <AISettingsSkillsPanel clients={clients} />
        </div>
      );
    case 'notifications':
      return (
        <NotificationsTabContent
          clients={emailHubClients}
          notifications={NOTIFICATION_REGISTRY.map((n) => ({
            key: n.key,
            label: n.label,
            description: n.description,
            kind: n.kind,
            trigger: n.trigger,
            cronSchedule: n.cronSchedule,
            recipientLabel: n.recipientLabel,
            params: n.params ?? null,
            previewable: Boolean(n.preview),
          }))}
        />
      );
    case 'trend-finder':
      return (
        <SectionPanel
          title="Trend finder"
          description="Per-platform scrape volumes and live per-unit pricing. Lower the volumes to cut cost; set any platform to 0 to skip it entirely."
        >
          <ScraperVolumesSection />
        </SectionPanel>
      );
  }
}
