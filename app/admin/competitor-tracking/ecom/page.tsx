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
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    redirect('/admin/dashboard');
  }

  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug, logo_url')
    .eq('is_active', true)
    .order('name');

  const { clientId } = await searchParams;

  // Fall back to the top-bar brand pill when no explicit ?clientId= is
  // passed. URL wins when present.
  let resolvedInitialClientId = clientId?.trim() || null;
  if (!resolvedInitialClientId) {
    const active = await getActiveAdminClient().catch(() => null);
    if (active?.brand?.id) resolvedInitialClientId = active.brand.id;
  }

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
