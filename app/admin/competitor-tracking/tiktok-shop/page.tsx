import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { TikTokShopHub } from '@/components/tiktok-shop/tiktok-shop-hub';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { getVaultClients } from '@/lib/vault/reader';
import { getActiveAdminClient } from '@/lib/admin/get-active-client';

type HubDbClientRow = {
  id: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  agency: string | null;
};

export default async function TikTokShopPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const [{ data: userData }, { data: searches }, vaultClients, rosterResult, active] = await Promise.all([
    admin.from('users').select('role, full_name').eq('id', user.id).single(),
    admin
      .from('tiktok_shop_searches')
      .select('id, query, status, products_found, creators_found, client_id, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(50),
    getVaultClients(),
    selectClientsWithRosterVisibility<HubDbClientRow>(admin, {
      select: 'id, slug, logo_url, is_active, agency',
      onlyActive: true,
    }),
    getActiveAdminClient().catch(() => null),
  ]);

  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    redirect('/admin/dashboard');
  }

  const raw = userData.full_name?.trim();
  const userFirstName =
    raw && raw.length > 0
      ? raw.split(/\s+/)[0] ?? null
      : user.email?.split('@')[0] ?? null;

  if (rosterResult.error) {
    console.error('TikTok Shop hub roster query:', rosterResult.error);
  }
  const clients = (rosterResult.data || [])
    .map((db) => {
      const vault = vaultClients.find((v) => v.slug === db.slug);
      return {
        id: db.id,
        name: vault?.name || db.slug,
        logo_url: db.logo_url,
        agency: vault?.agency?.trim() || db.agency?.trim() || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Seed from the top-bar pill so a pinned brand acts as the default
  // search scope.
  const initialClientId = active?.brand?.id ?? null;

  return (
    <TikTokShopHub
      initialSearches={searches ?? []}
      userFirstName={userFirstName}
      clients={clients}
      initialClientId={initialClientId}
    />
  );
}
