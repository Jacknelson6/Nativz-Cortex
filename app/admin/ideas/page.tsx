import { createAdminClient } from '@/lib/supabase/admin';
import { IdeasHubView } from '@/components/ideas-hub/ideas-hub-view';

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ search_id?: string; clientId?: string; focus?: string }>;
}) {
  const { search_id, clientId: clientIdParam, focus: focusParam } = await searchParams;
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

  const validUrlClientId =
    clientIdParam?.trim() && clients.some((c) => c.id === clientIdParam.trim())
      ? clientIdParam.trim()
      : null;
  const mergedInitialClientId = searchData?.client_id ?? validUrlClientId ?? null;
  const hasClientContext = mergedInitialClientId !== null;
  const focusRaw = focusParam?.trim();
  const initialFocus =
    hasClientContext &&
    (focusRaw === 'pillars' || focusRaw === 'ideas' || focusRaw === 'pillar-ideas')
      ? (focusRaw as 'pillars' | 'ideas' | 'pillar-ideas')
      : null;

  return (
    <IdeasHubView
      initialIdeas={savedIdeas ?? []}
      clients={clients}
      searchId={searchData?.id ?? null}
      searchQuery={searchData?.query ?? null}
      initialClientId={mergedInitialClientId}
      initialFocus={initialFocus}
    />
  );
}
