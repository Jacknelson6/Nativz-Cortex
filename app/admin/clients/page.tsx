import Link from 'next/link';
import { Building2, Sparkles } from 'lucide-react';
import { getVaultClients } from '@/lib/vault/reader';
import { createAdminClient } from '@/lib/supabase/admin';
import { GlowButton } from '@/components/ui/glow-button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { ClientSearchGrid } from '@/components/clients/client-search-grid';

export default async function AdminClientsPage() {
  try {
    const [vaultClients, dbIndustries] = await Promise.all([
      getVaultClients(),
      // Fetch industry from DB (backfilled from website analysis)
      createAdminClient()
        .from('clients')
        .select('slug, industry')
        .eq('is_active', true)
        .then(({ data }) => {
          const map = new Map<string, string>();
          for (const c of data ?? []) {
            if (c.industry && c.industry !== 'General') {
              map.set(c.slug, c.industry);
            }
          }
          return map;
        }),
    ]);

    // Merge DB industry into vault profiles (DB wins over vault "General")
    const mergedClients = vaultClients.map((c) => ({
      ...c,
      industry: dbIndustries.get(c.slug) || c.industry,
    }));

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">Clients</h1>
          <Link href="/admin/clients/onboard">
            <GlowButton>
              <Sparkles size={14} />
              Onboard
            </GlowButton>
          </Link>
        </div>

        {mergedClients.length === 0 ? (
          <EmptyState
            icon={<Building2 size={32} />}
            title="No clients yet"
            description="Add your first client to start running searches for them."
            action={
              <Link href="/admin/clients/onboard">
                <GlowButton>
                  <Sparkles size={14} />
                  Onboard client
                </GlowButton>
              </Link>
            }
          />
        ) : (
          <ClientSearchGrid clients={mergedClients} />
        )}
      </div>
    );
  } catch (error) {
    console.error('AdminClientsPage error:', error);
    return <PageError />;
  }
}
