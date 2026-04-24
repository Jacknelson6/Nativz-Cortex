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
import { AISettingsSkillsClient } from './skills-client';

export const dynamic = 'force-dynamic';

/**
 * Admin Settings — the levers that configure Cortex:
 *   Model, API key, Skills. (Personal account settings moved to
 *   /admin/account on 2026-04-24.)
 *
 * Overview, Search cost, and Usage tabs were retired and moved to
 * /admin/usage (usage lives under the AI tab there; scraper volumes
 * live under the Trend finder tab). Legacy slugs redirect.
 */
const LEGACY_REDIRECTS: Record<string, string> = {
  overview: '/admin/settings',
  'search-cost': '/admin/usage?tab=trend-finder',
  usage: '/admin/usage?tab=cost',
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
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const [{ data: me }, { data: clients }, params] = await Promise.all([
    admin.from('users').select('role, is_super_admin').eq('id', user.id).single(),
    admin.from('clients').select('id, name, slug').eq('is_active', true).order('name'),
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

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <SectionHeader
        title="AI"
        description="Pick the model, hold the key, wire the skills — that's the whole surface. Usage and search cost live under the Usage page."
        action={<RefreshButton action={refreshAiSettings} />}
      />

      <SectionTabs tabs={AI_SETTINGS_TABS} active={activeTab} memoryKey="cortex:ai-settings:last-tab" />

      <div>{renderTab(activeTab, clients ?? [])}</div>
    </div>
  );
}

function resolveTab(raw: string | undefined): AiSettingsTabSlug {
  if (raw && (AI_SETTINGS_TAB_SLUGS as readonly string[]).includes(raw)) {
    return raw as AiSettingsTabSlug;
  }
  return 'model';
}

function renderTab(
  slug: AiSettingsTabSlug,
  clients: Array<{ id: string; name: string; slug: string }>,
): React.ReactNode {
  switch (slug) {
    case 'model':
      return (
        <SectionPanel title="Model" description="One OpenRouter slug runs every Cortex feature.">
          <AiRoutingSection />
        </SectionPanel>
      );
    case 'credentials':
      return (
        <SectionPanel title="API key" description="A single OpenRouter key powers the model above.">
          <LlmCredentialsSection />
        </SectionPanel>
      );
    case 'skills':
      return (
        <SectionPanel
          title="Skills"
          description="Markdown context loaded into the Nerd's system prompt. Each skill picks which harnesses it applies to — the admin Nerd, admin Strategy Lab, and/or the portal Strategy Lab — and can be scoped to a single client."
        >
          <AISettingsSkillsClient clients={clients} />
        </SectionPanel>
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
