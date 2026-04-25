import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  EmailHubClient,
  type EmailHubClientOption,
} from '@/components/tools/email-hub/email-hub-client';

export const dynamic = 'force-dynamic';

export default async function EmailHubPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin' && me?.role !== 'super_admin') redirect('/admin/dashboard');

  const { data: clientRows } = await admin
    .from('clients')
    .select('id, name, agency')
    .order('name', { ascending: true });

  const clients: EmailHubClientOption[] = (clientRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    agency: c.agency ?? null,
  }));

  return <EmailHubClient clients={clients} />;
}
