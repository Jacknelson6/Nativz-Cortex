import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { ClientSearchGrid } from '@/components/clients/client-search-grid';

export default async function AdminClientsPage() {
  try {
    const adminClient = createAdminClient();

    // Check super admin status
    const supabase = await createServerSupabaseClient();
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    let isSuperAdmin = false;
    if (currentUser) {
      const { data: sa } = await adminClient.from('users').select('is_super_admin').eq('id', currentUser.id).single();
      isSuperAdmin = sa?.is_super_admin === true;
    }

    // Fetch all clients from DB
    const { data: dbClients, error: dbError } = await adminClient
      .from('clients')
      .select('id, name, slug, industry, is_active, logo_url, services, agency, health_score, organization_id')
      .order('name');

    if (dbError) {
      console.error('Database error fetching clients:', JSON.stringify(dbError, null, 2));
      throw dbError;
    }

    // Transform DB results to match the grid component's expectations
    const clients = (dbClients ?? []).map((c) => ({
      id: c.slug,
      dbId: c.id,
      name: c.name,
      slug: c.slug,
      industry: c.industry && c.industry !== 'General' ? c.industry : '',
      isActive: c.is_active ?? true,
      logoUrl: c.logo_url ?? null,
      services: (c.services as string[]) ?? [],
      agency: c.agency ?? null,
      healthScore: c.health_score ?? null,
      organizationId: c.organization_id ?? null,
    }));

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Clients</h1>
            <p className="text-sm text-text-muted mt-0.5">Manage your client roster and brand profiles</p>
          </div>
          {isSuperAdmin && (
            <Link href="/admin/clients/onboard">
              <Button size="sm">
                <Plus size={14} />
                Onboard
              </Button>
            </Link>
          )}
        </div>

        {clients.length === 0 ? (
          <EmptyState
            icon={<Building2 size={32} />}
            title="No clients yet"
            description="Add your first client to start running searches for them."
            action={
              <Link href="/admin/clients/onboard">
                <Button size="sm">
                  <Plus size={14} />
                  Onboard client
                </Button>
              </Link>
            }
          />
        ) : (
          <ClientSearchGrid clients={clients} />
        )}
      </div>
    );
  } catch (error: any) {
    console.error('AdminClientsPage full error:', error);
    if (error.message) console.error('Error message:', error.message);
    if (error.details) console.error('Error details:', error.details);
    if (error.hint) console.error('Error hint:', error.hint);
    if (error.code) console.error('Error code:', error.code);
    return <PageError />;
  }
}
