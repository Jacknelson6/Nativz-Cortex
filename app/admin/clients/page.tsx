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
    const [vaultClients, dbClients] = await Promise.all([
      getVaultClients(),
      // Fetch industry + is_active from DB
      createAdminClient()
        .from('clients')
        .select('slug, industry, is_active')
        .then(({ data }) => {
          const map = new Map<string, { industry: string; isActive: boolean }>();
          for (const c of data ?? []) {
            map.set(c.slug, {
              industry: c.industry && c.industry !== 'General' ? c.industry : '',
              isActive: c.is_active ?? true,
            });
          }
          return map;
        }),
    ]);

    // Merge DB fields into vault profiles
    const mergedClients = vaultClients.map((c) => {
      const db = dbClients.get(c.slug);
      return {
        ...c,
        industry: db?.industry || c.industry,
        isActive: db?.isActive ?? true,
      };
    });

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Clients</h1>
            <p className="text-sm text-text-muted mt-0.5">Manage your client roster and brand profiles</p>
          </div>
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
