import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { EmailHubClient } from '@/components/tools/email-hub/email-hub-client';
import type { ClientOption, UpdateRow } from './production-updates-client';

export const dynamic = 'force-dynamic';

export default async function EmailHubPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin' && me?.role !== 'super_admin') redirect('/admin/dashboard');

  const [clientsRes, updatesRes] = await Promise.all([
    admin.from('clients').select('id, name, agency').order('name', { ascending: true }),
    admin
      .from('production_updates')
      .select(
        'id, title, body_markdown, audience_agency, audience_client_id, status, sent_at, recipient_count, failure_reason, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  const clients: ClientOption[] = (clientsRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    agency: c.agency ?? null,
  }));

  const updates: UpdateRow[] = (updatesRes.data ?? []) as UpdateRow[];

  return (
    <EmailHubClient clients={clients} initialUpdates={updates} senderEmail={user.email ?? null} />
  );
}
