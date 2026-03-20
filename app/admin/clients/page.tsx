import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { ClientSearchGrid } from '@/components/clients/client-search-grid';

type AdminClientsDbRow = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  is_active: boolean | null;
  logo_url: string | null;
  services: unknown;
  agency: string | null;
  health_score: number | null;
  organization_id: string | null;
};

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
    const { data: dbClients, error: dbError } = await selectClientsWithRosterVisibility<AdminClientsDbRow>(
      adminClient,
      {
        select: 'id, name, slug, industry, is_active, logo_url, services, agency, health_score, organization_id',
        orderBy: { column: 'name' },
      },
    );

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
      agency: c.agency ?? undefined,
      healthScore: c.health_score != null ? String(c.health_score) : null,
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
  } catch (error: unknown) {
    console.error('AdminClientsPage full error:', error);
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    if (e.message) console.error('Error message:', e.message);
    if (e.details) console.error('Error details:', e.details);
    if (e.hint) console.error('Error hint:', e.hint);
    if (e.code) console.error('Error code:', e.code);
    return <PageError />;
  }
}
