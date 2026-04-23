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
import { AiSettingsOverviewTab } from '@/components/admin/ai-settings/overview-tab';
import { AiRoutingSection } from '@/components/settings/ai-routing-section';
import { LlmCredentialsSection } from '@/components/settings/llm-credentials-section';
import { UsageDashboard } from '@/components/settings/usage-dashboard';
import { ScraperVolumesSection } from '@/components/settings/scraper-volumes-section';
import { AISettingsSkillsClient } from './skills-client';

export const dynamic = 'force-dynamic';

/**
 * Unified AI settings — one page for model routing, credentials, skills,
 * search cost, and usage. Tabbed to match the Infrastructure page pattern:
 * Overview tiles link into each drill-in tab.
 */
export default async function AISettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name');

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <SectionHeader
        title="AI settings"
        description="Model routing, credentials, skills, search cost, and usage — everything the Nerd and its harnesses read from. Pick a tab to drill in."
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
  return 'overview';
}

function renderTab(
  slug: AiSettingsTabSlug,
  clients: Array<{ id: string; name: string; slug: string }>,
): React.ReactNode {
  switch (slug) {
    case 'overview':
      return <AiSettingsOverviewTab />;
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
    case 'search-cost':
      return (
        <SectionPanel
          title="Search volumes & cost"
          description="How many posts, videos, and pages each search pulls per platform. Right card estimates Apify cost per search from observed per-unit pricing. Real billing reads from the apify_runs table."
        >
          <ScraperVolumesSection />
        </SectionPanel>
      );
    case 'usage':
      return (
        <SectionPanel title="Usage" description="Model spend and token counts across the platform.">
          <UsageDashboard />
        </SectionPanel>
      );
  }
}
