import { unstable_noStore as noStore } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { SearchProcessing } from '@/components/search/search-processing';
import { getTopicSearchWebResearchMode } from '@/lib/config/topic-search-web-research';

export const dynamic = 'force-dynamic';

export default async function PortalSearchProcessingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();
  const { id } = await params;
  const result = await getPortalClient();

  if (!result) return null;

  // BUG 11: Require at least one of can_search or can_view_reports
  if (!result.client.feature_flags?.can_search && !result.client.feature_flags?.can_view_reports) notFound();

  const adminClient = createAdminClient();

  const { data: search, error } = await adminClient
    .from('topic_searches')
    .select('id, query, status, client_id, volume, platforms, topic_pipeline, subtopics')
    .eq('id', id)
    .single();

  if (error || !search) {
    notFound();
  }

  // Verify org scoping
  if (search.client_id) {
    const { data: clientData } = await adminClient
      .from('clients')
      .select('id, organization_id')
      .eq('id', search.client_id)
      .single();

    if (!clientData || clientData.organization_id !== result.organizationId) {
      notFound();
    }
  } else {
    notFound();
  }

  // If already completed, skip straight to results
  if (search.status === 'completed') {
    redirect(`/portal/search/${id}`);
  }

  const topicPipeline = (search.topic_pipeline as 'legacy' | 'llm_v1' | undefined) ?? 'legacy';
  const rawSub = search.subtopics as unknown;
  const subtopicCount = Array.isArray(rawSub) ? rawSub.length : 3;

  return (
    <SearchProcessing
      searchId={id}
      query={search.query}
      redirectPrefix="/portal"
      volume={(search.volume as string) ?? 'medium'}
      platforms={(search.platforms as string[]) ?? ['web']}
      pipeline={topicPipeline}
      subtopicCount={subtopicCount}
      webResearchMode={getTopicSearchWebResearchMode()}
    />
  );
}
