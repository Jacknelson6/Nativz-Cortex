import { createAdminClient } from '@/lib/supabase/admin';
import { getVaultClients } from '@/lib/vault/reader';
import { AdCreativesHub } from '@/components/ad-creatives/ad-creatives-hub';

export default async function AdCreativesPage() {
  const supabase = createAdminClient();

  // Fetch clients with logos (same pattern as research hub)
  const [vaultClients, { data: dbClients }] = await Promise.all([
    getVaultClients(),
    supabase
      .from('clients')
      .select('id, slug, logo_url, website_url, is_active')
      .eq('is_active', true),
  ]);

  const clients = (dbClients || []).map((db) => {
    const vault = vaultClients.find((v) => v.slug === db.slug);
    return {
      id: db.id,
      name: vault?.name || db.slug,
      slug: db.slug,
      logo_url: db.logo_url,
      website_url: db.website_url ?? null,
      agency: vault?.agency,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return <AdCreativesHub clients={clients} />;
}
