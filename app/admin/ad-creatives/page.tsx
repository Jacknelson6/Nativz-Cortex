import { createAdminClient } from '@/lib/supabase/admin';
import { getVaultClients } from '@/lib/vault/reader';
import { AdCreativesHub } from '@/components/ad-creatives/ad-creatives-hub';

export type RecentClient = {
  clientId: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  creativeCount: number;
};

export default async function AdCreativesPage() {
  const supabase = createAdminClient();

  // Fetch clients with logos + recent clients with creative counts
  const [vaultClients, { data: dbClients }, { data: recentBatches }] = await Promise.all([
    getVaultClients(),
    supabase
      .from('clients')
      .select('id, slug, logo_url, website_url, is_active')
      .eq('is_active', true),
    supabase
      .from('ad_generation_batches')
      .select('client_id, ad_creatives(count)')
      .in('status', ['completed', 'partial'])
      .order('created_at', { ascending: false })
      .limit(50),
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

  // Build recent clients from batches
  const clientCreativeCounts = new Map<string, number>();
  for (const batch of recentBatches ?? []) {
    const cid = batch.client_id as string;
    const count = (batch.ad_creatives as { count: number }[])?.[0]?.count ?? 0;
    clientCreativeCounts.set(cid, (clientCreativeCounts.get(cid) ?? 0) + count);
  }

  const recentClients: RecentClient[] = [...clientCreativeCounts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cid, count]) => {
      const client = clients.find((c) => c.id === cid);
      return {
        clientId: cid,
        slug: client?.slug ?? '',
        name: client?.name ?? 'Unknown',
        logo_url: client?.logo_url ?? null,
        website_url: client?.website_url ?? null,
        creativeCount: count,
      };
    })
    .filter((rc) => rc.slug); // Only include clients that exist

  return <AdCreativesHub clients={clients} recentClients={recentClients} />;
}
