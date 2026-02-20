import Link from 'next/link';
import { Plus, Building2 } from 'lucide-react';
import { getVaultClients } from '@/lib/vault/reader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';

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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vaultClients.map((client, i) => (
              <Link key={client.slug} href={`/admin/clients/${client.slug}`}>
                <Card interactive className="animate-stagger-in flex items-start gap-3" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-surface text-accent-text">
                    <Building2 size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text-primary truncate">{client.name}</p>
                      {client.abbreviation && (
                        <Badge variant="default">{client.abbreviation}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-muted">{client.industry || 'General'}</p>
                    {client.services.length > 0 && (
                      <p className="text-xs text-text-muted mt-1">
                        {client.services.join(' · ')}
                      </p>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('AdminClientsPage error:', error);
    return <PageError />;
  }
}
