import Link from 'next/link';
import { Plus, Building2 } from 'lucide-react';
import { getVaultClients } from '@/lib/vault/reader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { ClientSearchGrid } from '@/components/clients/client-search-grid';

export default async function AdminClientsPage() {
  try {
    const vaultClients = await getVaultClients();

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">Clients</h1>
          <Link href="/admin/clients/new">
            <Button>
              <Plus size={16} />
              Add client
            </Button>
          </Link>
        </div>

        {vaultClients.length === 0 ? (
          <EmptyState
            icon={<Building2 size={32} />}
            title="No clients yet"
            description="Add your first client to start running searches for them."
            action={
              <Link href="/admin/clients/new">
                <Button>Add client</Button>
              </Link>
            }
          />
        ) : (
          <ClientSearchGrid clients={vaultClients} />
        )}
      </div>
    );
  } catch (error) {
    console.error('AdminClientsPage error:', error);
    return <PageError />;
  }
}
