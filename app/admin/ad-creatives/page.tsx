import { Suspense } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
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

type AdCreativesDbClientRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  is_active: boolean;
  brand_dna_status: string | null;
};

export default async function AdCreativesPage() {
  const supabase = createAdminClient();

  // Fetch clients with logos + recent clients with creative counts
  const [vaultClients, rosterResult, { data: recentBatches }] = await Promise.all([
    getVaultClients(),
    selectClientsWithRosterVisibility<AdCreativesDbClientRow>(supabase, {
      select: 'id, slug, name, logo_url, website_url, is_active, brand_dna_status',
      onlyActive: true,
    }),
    supabase
      .from('ad_generation_batches')
      .select('client_id, ad_creatives(count)')
      .in('status', ['completed', 'partial'])
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const dbClients = rosterResult.data;
  if (rosterResult.error) {
    console.error('Ad creatives roster query:', rosterResult.error);
  }

  const clients = (dbClients || []).map((db) => {
    const vault = vaultClients.find((v) => v.slug === db.slug);
    return {
      id: db.id,
      name: vault?.name || db.name || db.slug,
      slug: db.slug,
      logo_url: db.logo_url,
      website_url: db.website_url ?? null,
      brand_dna_status: db.brand_dna_status ?? 'none',
      agency: vault?.agency,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const rosterClientById = new Map(clients.map((c) => [c.id, c]));

  // Build recent clients from batches
  const clientCreativeCounts = new Map<string, number>();
  for (const batch of recentBatches ?? []) {
    const cid = batch.client_id as string;
    const count = (batch.ad_creatives as { count: number }[])?.[0]?.count ?? 0;
    clientCreativeCounts.set(cid, (clientCreativeCounts.get(cid) ?? 0) + count);
  }

  const topRecentIds = [...clientCreativeCounts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cid]) => cid);

  const idsNotOnRoster = topRecentIds.filter((id) => !rosterClientById.has(id));

  type RecentRow = { id: string; slug: string; name: string; logo_url: string | null; website_url: string | null };
  const hiddenRecentById = new Map<string, RecentRow>();
  if (idsNotOnRoster.length > 0) {
    const { data: hiddenRows } = await supabase
      .from('clients')
      .select('id, slug, name, logo_url, website_url')
      .in('id', idsNotOnRoster);
    for (const row of hiddenRows ?? []) {
      hiddenRecentById.set(row.id, row as RecentRow);
    }
  }

  const recentClients: RecentClient[] = topRecentIds
    .map((cid) => {
      const count = clientCreativeCounts.get(cid) ?? 0;
      if (count <= 0) return null;
      const roster = rosterClientById.get(cid);
      if (roster) {
        return {
          clientId: cid,
          slug: roster.slug,
          name: roster.name,
          logo_url: roster.logo_url,
          website_url: roster.website_url,
          creativeCount: count,
        };
      }
      const hidden = hiddenRecentById.get(cid);
      if (!hidden?.slug) return null;
      return {
        clientId: cid,
        slug: hidden.slug,
        name: hidden.name?.trim() || hidden.slug,
        logo_url: hidden.logo_url,
        website_url: hidden.website_url ?? null,
        creativeCount: count,
      };
    })
    .filter((rc): rc is RecentClient => rc != null);

  return (
    <Suspense
      fallback={
        <div className="cortex-page-gutter max-w-7xl mx-auto space-y-4 animate-pulse">
          <div className="h-8 w-48 rounded-lg bg-surface border border-nativz-border" />
          <div className="h-64 rounded-2xl bg-surface border border-nativz-border" />
        </div>
      }
    >
      <AdCreativesHub clients={clients} recentClients={recentClients} />
    </Suspense>
  );
}
