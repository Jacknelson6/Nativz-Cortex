import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound, redirect } from 'next/navigation';
import type { TopicSearch } from '@/lib/types/search';
import { AdminResultsClient } from './results-client';
import { AnalysisChatDrawer } from '@/components/analyses/analysis-chat-drawer';

export default async function AdminSearchResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: search, error } = await supabase
    .from('topic_searches')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !search) {
    notFound();
  }

  if (search.status === 'pending_subtopics') {
    redirect(`/admin/finder/${id}/subtopics`);
  }

  if (search.status === 'processing' || search.status === 'pending') {
    redirect(`/admin/finder/${id}/processing`);
  }

  const adminClient = createAdminClient();

  // Client info + scraped-video count are both keyed off `search` but
  // independent of each other — parallel saves a round-trip.
  const [clientRes, countRes] = await Promise.all([
    search.client_id
      ? adminClient
          .from('clients')
          .select('id, name, slug, industry, topic_keywords')
          .eq('id', search.client_id)
          .single()
      : Promise.resolve({ data: null as {
          id: string;
          name: string;
          slug: string;
          industry: string;
          topic_keywords: string[] | null;
        } | null }),
    adminClient
      .from('topic_search_videos')
      .select('id', { count: 'exact', head: true })
      .eq('search_id', id),
  ]);
  const clientInfo = clientRes.data ?? null;
  const scrapedVideoCount = countRes.count ?? 0;

  return (
    <>
      <AdminResultsClient
        search={search as TopicSearch}
        clientInfo={clientInfo}
        scrapedVideoCount={scrapedVideoCount}
      />
      {search.status === 'completed' && (
        <AnalysisChatDrawer
          scopeType="topic_search"
          scopeId={search.id}
          scopeLabel={search.query}
          strategyLabHref={
            clientInfo
              ? `/admin/strategy-lab/${clientInfo.id}?attach=topic_search:${search.id}`
              : `/admin/strategy-lab?attach=topic_search:${search.id}`
          }
        />
      )}
    </>
  );
}
