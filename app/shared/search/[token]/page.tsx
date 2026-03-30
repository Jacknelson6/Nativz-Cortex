import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { SharedSearchClient } from './shared-search-client';

export default async function SharedSearchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const adminClient = createAdminClient();

  const { data: link } = await adminClient
    .from('search_share_links')
    .select('search_id, expires_at')
    .eq('token', token)
    .single();

  if (!link) notFound();

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    notFound();
  }

  const { data: search } = await adminClient
    .from('topic_searches')
    .select('*')
    .eq('id', link.search_id)
    .eq('status', 'completed')
    .single();

  if (!search) notFound();

  let clientName: string | null = null;
  let clientSlug: string | null = null;
  if (search.client_id) {
    const { data: client } = await adminClient
      .from('clients')
      .select('name, slug')
      .eq('id', search.client_id)
      .single();
    clientName = client?.name || null;
    clientSlug = client?.slug || null;
  }

  // Fetch scraped video count for v3 sections
  const { count: scrapedVideoCount } = await adminClient
    .from('topic_search_videos')
    .select('id', { count: 'exact', head: true })
    .eq('search_id', link.search_id);

  return (
    <SharedSearchClient
      search={search}
      clientName={clientName}
      clientSlug={clientSlug}
      shareToken={token}
      scrapedVideoCount={scrapedVideoCount ?? 0}
    />
  );
}
