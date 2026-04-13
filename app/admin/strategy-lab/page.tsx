import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { PageError } from '@/components/shared/page-error';
import { StrategyLabGeneralChat } from '@/components/strategy-lab/strategy-lab-general-chat';

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean | null;
  logo_url: string | null;
  agency: string | null;
};

export default async function StrategyLabIndexPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/admin/login');
  }

  try {
    const adminClient = createAdminClient();
    const { data: dbClients, error: dbError } = await selectClientsWithRosterVisibility<ClientRow>(
      adminClient,
      {
        select: 'id, name, slug, is_active, logo_url, agency',
        orderBy: { column: 'name' },
      },
    );

    if (dbError) throw dbError;

    const clients = (dbClients ?? [])
      .filter((c) => c.is_active !== false)
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        logo_url: c.logo_url,
        agency: c.agency,
      }));

    return (
      <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col p-4 md:p-6">
        <StrategyLabGeneralChat clients={clients} />
      </div>
    );
  } catch (err) {
    console.error('Strategy lab index:', err);
    return <PageError title="Could not load clients" />;
  }
}
