import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import type { TopicSearch } from '@/lib/types/search';
import { extractVideoCandidatesFromSearch } from '@/lib/ideation/extract-video-candidates';
import { AdminResultsClient } from './results-client';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

export interface Recipient {
  id: string;
  name: string;
  email: string;
  group: 'team' | 'client';
}

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

  const adminClient = createAdminClient();

  // Fetch client info if attached
  let clientInfo: { id: string; name: string; slug: string; industry: string } | null = null;
  if (search.client_id) {
    const { data } = await adminClient
      .from('clients')
      .select('id, name, slug, industry')
      .eq('id', search.client_id)
      .single();
    clientInfo = data || null;
  }

  // Fetch all active clients for the ideas wizard picker
  const { data: allClients } = await adminClient
    .from('clients')
    .select('id, name, logo_url, agency')
    .eq('is_active', true)
    .order('name');

  // Fetch potential recipients: team (admins) + client contacts (viewers in same org)
  const recipients: Recipient[] = [];

  const { data: teamUsers } = await adminClient
    .from('users')
    .select('id, full_name, email')
    .eq('role', 'admin');

  if (teamUsers) {
    for (const u of teamUsers) {
      if (u.email) {
        recipients.push({ id: u.id, name: u.full_name || u.email, email: u.email, group: 'team' });
      }
    }
  }

  if (clientInfo) {
    const { data: clientOrg } = await adminClient
      .from('clients')
      .select('organization_id')
      .eq('id', clientInfo.id)
      .single();

    if (clientOrg?.organization_id) {
      const { data: clientUsers } = await adminClient
        .from('users')
        .select('id, full_name, email')
        .eq('organization_id', clientOrg.organization_id)
        .eq('role', 'viewer');

      if (clientUsers) {
        for (const u of clientUsers) {
          if (u.email) {
            recipients.push({ id: u.id, name: u.full_name || u.email, email: u.email, group: 'client' });
          }
        }
      }
    }
  }

  // Fetch idea generations linked to this search
  const { data: linkedGenerations } = await adminClient
    .from('idea_generations')
    .select('id, concept, count, status, created_at')
    .eq('search_id', id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(5);

  const videoCandidates = extractVideoCandidatesFromSearch(search as TopicSearch);

  const { data: linkedBoardsRaw, error: linkedBoardsError } = await adminClient
    .from('moodboard_boards')
    .select('id, name, updated_at')
    .eq('source_topic_search_id', id)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (linkedBoardsError) {
    console.warn('Linked moodboards query (run migration 066 if column missing):', linkedBoardsError.message);
  }
  const linkedBoards = linkedBoardsError ? [] : (linkedBoardsRaw ?? []);

  return (
    <>
      <div className="px-6 pt-6">
        <Breadcrumbs items={[
          { label: 'Search History', href: '/admin/search/new?history=true' },
          { label: (search as TopicSearch).query },
        ]} />
      </div>
      <AdminResultsClient
        search={search as TopicSearch}
        clientInfo={clientInfo}
        recipients={recipients}
        clients={(allClients ?? []).map((c) => ({ id: c.id, name: c.name, logo_url: c.logo_url, agency: c.agency }))}
        linkedIdeas={(linkedGenerations ?? []).map((g) => ({
          id: g.id,
          concept: g.concept,
          count: g.count,
          createdAt: g.created_at,
        }))}
        linkedBoards={linkedBoards.map((b) => ({ id: b.id, name: b.name ?? 'Board' }))}
        videoCandidateCount={videoCandidates.length}
      />
    </>
  );
}
