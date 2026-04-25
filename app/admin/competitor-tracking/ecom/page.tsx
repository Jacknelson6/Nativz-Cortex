import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { EcomTrackerClient } from '@/components/ecom-competitors/ecom-tracker-client';
import { getActiveAdminClient } from '@/lib/admin/get-active-client';

export default async function EcomCompetitorTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [{ data: userData }, { data: clients }, { clientId }, active] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    admin.from('clients').select('id, name, slug, logo_url').eq('is_active', true).order('name'),
    searchParams,
    getActiveAdminClient().catch(() => null),
  ]);
  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    redirect('/admin/dashboard');
  }

  const resolvedInitialClientId = clientId?.trim() || active?.brand?.id || null;

  return (
    <EcomTrackerClient
      clients={(clients ?? []).map((c) => ({
        id: c.id,
        name: c.name ?? c.slug ?? 'Client',
        slug: c.slug,
        logo_url: c.logo_url,
      }))}
      initialClientId={resolvedInitialClientId}
    />
  );
}
