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
    redirect(`/admin/search/${id}/subtopics`);
  }

  if (search.status === 'processing' || search.status === 'pending') {
    redirect(`/admin/search/${id}/processing`);
  }

  const adminClient = createAdminClient();

  // Fetch client info if attached
  let clientInfo: {
    id: string;
    name: string;
    slug: string;
    industry: string;
    topic_keywords: string[] | null;
  } | null = null;
  if (search.client_id) {
    const { data } = await adminClient
      .from('clients')
      .select('id, name, slug, industry, topic_keywords')
      .eq('id', search.client_id)
      .single();
    clientInfo = data || null;
  }

  // Fetch scraped video count
  const { count: scrapedVideoCount } = await adminClient
    .from('topic_search_videos')
    .select('id', { count: 'exact', head: true })
    .eq('search_id', id);

  return (
    <>
      <AdminResultsClient
        search={search as TopicSearch}
        clientInfo={clientInfo}
        scrapedVideoCount={scrapedVideoCount ?? 0}
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
