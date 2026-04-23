import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AiRoutingSection } from '@/components/settings/ai-routing-section';
import { LlmCredentialsSection } from '@/components/settings/llm-credentials-section';
import { UsageDashboard } from '@/components/settings/usage-dashboard';
import { ScraperVolumesSection } from '@/components/settings/scraper-volumes-section';
import { AISettingsSkillsClient } from './skills-client';

export const dynamic = 'force-dynamic';

/**
 * Unified AI settings — one page for model routing, credentials, skills,
 * and usage. Admin-only. `buildDbSkillsContext` in the chat route filters
 * skills by harness + client at request time so the portal never receives
 * admin-only skill context unless explicitly shared.
 */
export default async function AISettingsPage() {
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

  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name');

  return (
    <div className="cortex-page-gutter max-w-5xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">AI settings</h1>
        <p className="mt-1 text-sm text-text-muted max-w-2xl">
          Model routing, credentials, skills, and usage — everything the Nerd
          and its harnesses read from.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Model</h2>
          <p className="mt-1 text-xs text-text-muted">One OpenRouter slug runs every Cortex feature.</p>
        </div>
        <AiRoutingSection />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">API key</h2>
          <p className="mt-1 text-xs text-text-muted">A single OpenRouter key powers the model above.</p>
        </div>
        <LlmCredentialsSection />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Skills</h2>
          <p className="mt-1 text-xs text-text-muted max-w-2xl">
            Markdown context loaded into the Nerd's system prompt. Each skill picks which
            harnesses it applies to — the admin Nerd, admin Strategy Lab, and/or the portal
            Strategy Lab — and can be scoped to a single client.
          </p>
        </div>
        <AISettingsSkillsClient clients={clients ?? []} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Search volumes &amp; cost</h2>
          <p className="mt-1 text-xs text-text-muted max-w-2xl">
            How many posts, videos, and pages each search pulls per platform. The right
            card estimates the Apify cost per search based on observed per-unit pricing.
            Real billing reads from the <code className="rounded bg-background/60 px-1">apify_runs</code> table.
          </p>
        </div>
        <ScraperVolumesSection />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Usage</h2>
          <p className="mt-1 text-xs text-text-muted">Model spend and token counts across the platform.</p>
        </div>
        <UsageDashboard />
      </section>
    </div>
  );
}
