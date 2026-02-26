import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import type { TopicSearch } from '@/lib/types/search';
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
  let clientInfo: { id: string; name: string; slug: string } | null = null;
  if (search.client_id) {
    const { data } = await adminClient
      .from('clients')
      .select('id, name, slug')
      .eq('id', search.client_id)
      .single();
    clientInfo = data || null;
  }

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

  return (
    <>
      <div className="px-6 pt-6">
        <Breadcrumbs items={[
          { label: 'Search History', href: '/admin/search/history' },
          { label: (search as TopicSearch).query },
        ]} />
      </div>
      <AdminResultsClient search={search as TopicSearch} clientInfo={clientInfo} recipients={recipients} />
    </>
  );
}
