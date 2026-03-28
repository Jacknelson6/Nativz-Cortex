import { Suspense } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { getVaultClients } from '@/lib/vault/reader';
import { ResearchHub } from '@/components/research/research-hub';
import { fetchHistory, TOPIC_SEARCH_HUB_HISTORY_LIMIT } from '@/lib/research/history';
import { getTopicSearchPipelineFromEnv } from '@/lib/config/topic-search-pipeline';

type ResearchHubDbClientRow = {
  id: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
};

export default async function AdminNewSearchPage() {
  const supabase = createAdminClient();

  // Fetch clients with logos and agencies
  const [vaultClients, rosterResult] = await Promise.all([
    getVaultClients(),
    selectClientsWithRosterVisibility<ResearchHubDbClientRow>(supabase, {
      select: 'id, slug, logo_url, is_active',
      onlyActive: true,
    }),
  ]);

  const dbClients = rosterResult.data;
  if (rosterResult.error) {
    console.error('Research hub roster query:', rosterResult.error);
  }

  const clients = (dbClients || []).map((db) => {
    const vault = vaultClients.find((v) => v.slug === db.slug);
    return {
      id: db.id,
      name: vault?.name || db.slug,
      logo_url: db.logo_url,
      agency: vault?.agency,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const historyItems = await fetchHistory({
    limit: TOPIC_SEARCH_HUB_HISTORY_LIMIT,
    includeIdeas: false,
  });
  const topicPipelineLlmV1 = getTopicSearchPipelineFromEnv() === 'llm_v1';

  const serverSupabase = await createServerSupabaseClient();
  const {
    data: { user: authUser },
  } = await serverSupabase.auth.getUser();
  let userFirstName: string | null = null;
  if (authUser) {
    const { data: userRow } = await serverSupabase
      .from('users')
      .select('full_name')
      .eq('id', authUser.id)
      .maybeSingle();
    const raw = userRow?.full_name?.trim();
    if (raw) {
      userFirstName = raw.split(/\s+/)[0] ?? null;
    } else if (authUser.email) {
      userFirstName = authUser.email.split('@')[0] ?? null;
    }
  }

  return (
    <Suspense
      fallback={
        <div className="cortex-page-gutter max-w-5xl mx-auto space-y-4 animate-pulse">
          <div className="h-8 w-56 rounded-lg bg-surface border border-nativz-border" />
          <div className="h-96 rounded-xl bg-surface border border-nativz-border" />
        </div>
      }
    >
      <ResearchHub
        clients={clients}
        historyItems={historyItems}
        topicPipelineLlmV1={topicPipelineLlmV1}
        userFirstName={userFirstName}
      />
    </Suspense>
  );
}
