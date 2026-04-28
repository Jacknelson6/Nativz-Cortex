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
    redirect(`/finder/${id}/subtopics`);
  }

  if (search.status === 'processing' || search.status === 'pending') {
    redirect(`/finder/${id}/processing`);
  }

  const adminClient = createAdminClient();

  // Client info + scraped video rows are both keyed off `search` but
  // independent of each other — parallel saves a round-trip.
  //
  // We fetch the FULL video rows (not just count) so the SourceBrowser can
  // fall back to this canonical store when `platform_data.sources` is
  // missing — which happens whenever the bulky platform_data UPDATE
  // exceeded PostgREST's row-size budget (typically 250+ scraped sources)
  // and got dropped by the persistence fallback.
  const [clientRes, videoRowsRes] = await Promise.all([
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
      .select('platform, platform_id, url, title, author_username, thumbnail_url, views, likes, comments, publish_date')
      .eq('search_id', id)
      .order('views', { ascending: false }),
  ]);
  const clientInfo = clientRes.data ?? null;
  const videoRows = videoRowsRes.data ?? [];
  const scrapedVideoCount = videoRows.length;

  return (
    <>
      <AdminResultsClient
        search={search as TopicSearch}
        clientInfo={clientInfo}
        scrapedVideoCount={scrapedVideoCount}
        videoRows={videoRows}
      />
      {search.status === 'completed' && (
        <AnalysisChatDrawer
          scopeType="topic_search"
          scopeId={search.id}
          scopeLabel={search.query}
          strategyLabHref={
            clientInfo
              ? `/lab/${clientInfo.id}?attach=topic_search:${search.id}`
              : `/lab?attach=topic_search:${search.id}`
          }
        />
      )}
    </>
  );
}
