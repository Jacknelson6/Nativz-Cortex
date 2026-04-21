import { Suspense } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { getVaultClients } from '@/lib/vault/reader';
import { ResearchHub } from '@/components/research/research-hub';
import { fetchHistory, TOPIC_SEARCH_HUB_HISTORY_LIMIT } from '@/lib/research/history';

type ResearchHubDbClientRow = {
  id: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  agency: string | null;
};

export default async function AdminNewSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const { query: queryParam } = await searchParams;
  const prefillQuery = typeof queryParam === 'string' ? queryParam : '';

  const supabase = createAdminClient();
  const serverSupabase = await createServerSupabaseClient();

  // Kick off the auth check + user-name lookup as a single chained promise
  // so it can run alongside the other fetches. None of the roster / vault /
  // history queries depend on the authed user's id, so there's no reason
  // for them to wait on each other.
  const greetingPromise = (async () => {
    const {
      data: { user: authUser },
    } = await serverSupabase.auth.getUser();
    if (!authUser) return null;
    const { data: userRow } = await serverSupabase
      .from('users')
      .select('full_name')
      .eq('id', authUser.id)
      .maybeSingle();
    const raw = userRow?.full_name?.trim();
    if (raw) return raw.split(/\s+/)[0] ?? null;
    if (authUser.email) return authUser.email.split('@')[0] ?? null;
    return null;
  })();

  // Vault supplies display name when present; agency comes from vault first, else Postgres (admin client profile)
  const [vaultClients, rosterResult, historyItems, userFirstName] = await Promise.all([
    getVaultClients(),
    selectClientsWithRosterVisibility<ResearchHubDbClientRow>(supabase, {
      select: 'id, slug, logo_url, is_active, agency',
      onlyActive: true,
    }),
    fetchHistory({
      limit: TOPIC_SEARCH_HUB_HISTORY_LIMIT,
      includeIdeas: false,
    }),
    greetingPromise,
  ]);

  const dbClients = rosterResult.data;
  if (rosterResult.error) {
    console.error('Research hub roster query:', rosterResult.error);
  }

  const clients = (dbClients || []).map((db) => {
    const vault = vaultClients.find((v) => v.slug === db.slug);
    const agencyFromVault = vault?.agency?.trim();
    const agencyFromDb = db.agency?.trim();
    return {
      id: db.id,
      name: vault?.name || db.slug,
      logo_url: db.logo_url,
      agency: agencyFromVault || agencyFromDb || null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

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
        userFirstName={userFirstName}
        prefillQuery={prefillQuery}
      />
    </Suspense>
  );
}
