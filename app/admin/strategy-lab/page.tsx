import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { PageError } from '@/components/shared/page-error';
import { StrategyLabIndex } from '@/components/strategy-lab/strategy-lab-index';

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean | null;
  logo_url: string | null;
};

export default async function StrategyLabIndexPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/admin/login');
  }

  let userFirstName: string | null = null;
  const { data: userRow } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const raw = userRow?.full_name?.trim();
  if (raw) {
    userFirstName = raw.split(/\s+/)[0] ?? null;
  } else if (user.email) {
    userFirstName = user.email.split('@')[0] ?? null;
  }

  try {
    const adminClient = createAdminClient();
    const { data: dbClients, error: dbError } = await selectClientsWithRosterVisibility<ClientRow>(
      adminClient,
      {
        select: 'id, name, slug, is_active, logo_url',
        orderBy: { column: 'name' },
      },
    );

    if (dbError) throw dbError;

    const clients = (dbClients ?? []).filter((c) => c.is_active !== false);

    return <StrategyLabIndex clients={clients} userFirstName={userFirstName} />;
  } catch (err) {
    console.error('Strategy lab index:', err);
    return <PageError title="Could not load clients" />;
  }
}
