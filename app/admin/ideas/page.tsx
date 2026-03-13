import { createAdminClient } from '@/lib/supabase/admin';
import { IdeasHubView } from '@/components/ideas-hub/ideas-hub-view';

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ search_id?: string }>;
}) {
  const { search_id } = await searchParams;
  const supabase = createAdminClient();

  const [{ data: dbClients }, { data: savedIdeas }, searchData] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('client_knowledge_entries')
      .select('id, client_id, title, content, metadata, source, created_at')
      .eq('type', 'idea')
      .order('created_at', { ascending: false })
      .limit(200),
    search_id
      ? supabase
          .from('topic_searches')
          .select('id, query, client_id')
          .eq('id', search_id)
          .single()
          .then(({ data }) => data)
      : Promise.resolve(null),
  ]);

  const clients = (dbClients ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? '',
  }));

  return (
    <IdeasHubView
      initialIdeas={savedIdeas ?? []}
      clients={clients}
      searchId={searchData?.id ?? null}
      searchQuery={searchData?.query ?? null}
      searchClientId={searchData?.client_id ?? null}
    />
  );
}
