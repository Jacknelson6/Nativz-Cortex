import { createAdminClient } from '@/lib/supabase/admin';
import { getVaultClients } from '@/lib/vault/reader';
import { ResearchHub } from '@/components/research/research-hub';
import { fetchHistory } from '@/lib/research/history';

export default async function AdminNewSearchPage() {
  const supabase = createAdminClient();

  // Fetch clients with logos and agencies
  const [vaultClients, { data: dbClients }] = await Promise.all([
    getVaultClients(),
    supabase
      .from('clients')
      .select('id, slug, logo_url, is_active')
      .eq('is_active', true),
  ]);

  const clients = (dbClients || []).map((db) => {
    const vault = vaultClients.find((v) => v.slug === db.slug);
    return {
      id: db.id,
      name: vault?.name || db.slug,
      logo_url: db.logo_url,
      agency: vault?.agency,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Fetch merged history
  const historyItems = await fetchHistory({ limit: 10 });

  return <ResearchHub clients={clients} historyItems={historyItems} />;
}
