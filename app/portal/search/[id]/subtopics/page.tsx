import { unstable_noStore as noStore } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { SubtopicsPlanClient } from '@/components/research/subtopics-plan-client';
import { getTimeRangeOptionLabel } from '@/lib/types/search';

export const dynamic = 'force-dynamic';

export default async function PortalSearchSubtopicsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();
  const { id } = await params;
  const result = await getPortalClient();

  if (!result) return null;

  if (!result.client.feature_flags?.can_search) notFound();

  const adminClient = createAdminClient();

  const { data: search, error } = await adminClient
    .from('topic_searches')
    .select('id, query, status, client_id, topic_pipeline, time_range, source')
    .eq('id', id)
    .single();

  if (error || !search) notFound();

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

  if ((search as { topic_pipeline?: string }).topic_pipeline !== 'llm_v1') {
    notFound();
  }

  if (search.status === 'completed') {
    redirect(`/portal/search/${id}`);
  }
  if (search.status === 'processing' || search.status === 'pending') {
    redirect(`/portal/search/${id}/processing`);
  }
  if (search.status !== 'pending_subtopics') {
    notFound();
  }

  const timeRangeLabel = getTimeRangeOptionLabel(
    (search as { time_range?: string | null }).time_range ?? 'last_3_months',
  );

  return (
    <SubtopicsPlanClient
      searchId={search.id}
      query={search.query}
      timeRangeLabel={timeRangeLabel}
      initialTimeRange={(search as { time_range?: string | null }).time_range ?? 'last_3_months'}
      initialSource={(search as { source?: string }).source ?? 'all'}
      redirectPrefix="/portal"
    />
  );
}
