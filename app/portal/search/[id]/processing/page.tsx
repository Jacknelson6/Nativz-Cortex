import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { SearchProcessing } from '@/components/search/search-processing';

export default async function PortalSearchProcessingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPortalClient();

  if (!result) return null;

  const adminClient = createAdminClient();

  const { data: search, error } = await adminClient
    .from('topic_searches')
    .select('id, query, status, client_id')
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

  return <SearchProcessing searchId={id} query={search.query} redirectPrefix="/portal" />;
}
