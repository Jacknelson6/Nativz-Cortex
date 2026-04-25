import { createAdminClient } from '@/lib/supabase/admin';
import { IdeasHubView } from '@/components/ideas-hub/ideas-hub-view';
import { getActiveBrand } from '@/lib/active-brand';

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ search_id?: string; clientId?: string; focus?: string }>;
}) {
  const { search_id, clientId: clientIdParam, focus: focusParam } = await searchParams;
  const supabase = createAdminClient();

  // Fall back to the top-bar brand pill when no explicit ?clientId= is
  // passed. URL wins when present (keeps deep-links working), cookie fills
  // in the "default working brand" otherwise. Failure is silent — Ideas
  // still renders its own in-page picker when neither source resolves.
  const activeFromPill = !clientIdParam?.trim()
    ? await getActiveBrand().catch(() => null)
    : null;
  const resolvedClientIdParam = clientIdParam?.trim() || activeFromPill?.brand?.id || undefined;

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
    resolvedClientIdParam && clients.some((c) => c.id === resolvedClientIdParam)
      ? resolvedClientIdParam
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
