import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import type { TopicSearch } from '@/lib/types/search';
import { PortalResultsClient, PortalResultsPending } from './portal-results-client';

export default async function PortalSearchResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPortalClient();

  if (!result) return null;

  // Enforce can_view_reports feature flag
  if (!result.client.feature_flags?.can_view_reports) notFound();

  const adminClient = createAdminClient();

  const { data: search, error } = await adminClient
    .from('topic_searches')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !search) {
    notFound();
  }

  // Verify client ownership — search must belong to the user's specific client
  if (!search.client_id || search.client_id !== result.client.id) {
    notFound();
  }

  // Verify org scoping: search's client must belong to user's org
  const { data: clientData } = await adminClient
    .from('clients')
    .select('id, organization_id, name, slug, industry, topic_keywords')
    .eq('id', search.client_id)
    .single();

  if (!clientData || clientData.organization_id !== result.organizationId) {
    notFound();
  }

  if (search.status === 'pending_subtopics') {
    redirect(`/portal/search/${id}/subtopics`);
  }

  if (search.status === 'processing' || search.status === 'pending') {
    redirect(`/portal/search/${id}/processing`);
  }

  // Fetch scraped video count
  const { count: scrapedVideoCount } = await adminClient
    .from('topic_search_videos')
    .select('id', { count: 'exact', head: true })
    .eq('search_id', id);

  return (
    <PortalResultsClient
      search={search as TopicSearch}
      clientName={clientData.name ?? null}
      scrapedVideoCount={scrapedVideoCount ?? 0}
      clientInfo={{
        id: clientData.id,
        name: clientData.name,
        slug: clientData.slug,
        industry: clientData.industry ?? undefined,
        topic_keywords: (clientData.topic_keywords as string[] | null) ?? null,
      }}
      canUseContentLab={Boolean(result.client.feature_flags?.can_use_nerd)}
    />
  );
}
