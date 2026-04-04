import { Suspense } from 'react';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchHistory, TOPIC_SEARCH_HUB_HISTORY_LIMIT } from '@/lib/research/history';
import { PortalResearchHub } from './portal-research-hub';

export const dynamic = 'force-dynamic';

export default async function PortalNewSearchPage() {
  const result = await getPortalClient();
  if (!result) return null;

  if (!result.client.feature_flags.can_search) {
    return (
      <div className="flex flex-col items-center justify-center p-6 pt-24">
        <EmptyState
          icon={<SearchX size={32} />}
          title="Topic search is not enabled"
          description="Topic search is not enabled for your account. Contact your team for access."
        />
      </div>
    );
  }

  // Fetch user name for greeting
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  let userFirstName: string | null = null;
  if (user) {
    const { data: userRow } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    const raw = userRow?.full_name?.trim();
    if (raw) {
      userFirstName = raw.split(/\s+/)[0] ?? null;
    } else if (user.email) {
      userFirstName = user.email.split('@')[0] ?? null;
    }
  }

  // Fetch history for this client
  const historyItems = await fetchHistory({
    limit: TOPIC_SEARCH_HUB_HISTORY_LIMIT,
    clientId: result.client.id,
    includeIdeas: false,
  });

  return (
    <Suspense
      fallback={
        <div className="cortex-page-gutter max-w-5xl mx-auto space-y-4 animate-pulse">
          <div className="h-8 w-56 rounded-lg bg-surface border border-nativz-border" />
          <div className="h-96 rounded-xl bg-surface border border-nativz-border" />
        </div>
      }
    >
      <PortalResearchHub
        client={{ id: result.client.id, name: result.client.name, logo_url: null, agency: null }}
        historyItems={historyItems}
        userFirstName={userFirstName}
      />
    </Suspense>
  );
}
