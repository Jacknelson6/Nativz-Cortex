import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import type { TopicSearch } from '@/lib/types/search';
import { AdminResultsClient } from './results-client';

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

  // Fetch client info if attached
  let clientInfo: { id: string; name: string; slug: string } | null = null;
  if (search.client_id) {
    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from('clients')
      .select('id, name, slug')
      .eq('id', search.client_id)
      .single();
    clientInfo = data || null;
  }

  return <AdminResultsClient search={search as TopicSearch} clientInfo={clientInfo} />;
}
