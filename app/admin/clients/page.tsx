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
  group_id: string | null;
};

type ClientGroupRow = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
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

    // Fetch all clients + pipeline groups in parallel (independent I/O).
    const [
      { data: dbClients, error: dbError },
      { data: groupsData },
    ] = await Promise.all([
      selectClientsWithRosterVisibility<AdminClientsDbRow>(adminClient, {
        select: 'id, name, slug, industry, is_active, logo_url, services, agency, health_score, organization_id, group_id',
        orderBy: { column: 'name' },
      }),
      adminClient
        .from('client_groups')
        .select('id, name, color, sort_order')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);

    if (dbError) {
      console.error('Database error fetching clients:', JSON.stringify(dbError, null, 2));
      throw dbError;
    }

    const groups: ClientGroupRow[] = (groupsData as ClientGroupRow[] | null) ?? [];

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
      groupId: c.group_id ?? null,
    }));

    return (
      <div className="cortex-page-gutter space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="ui-page-title">Clients</h1>
            <p className="text-[15px] text-text-muted mt-1">
              Manage your client roster and brand profiles
              {clients.length > 0 && (
                <span className="ml-2 text-text-muted/60 tabular-nums">· {clients.length}</span>
              )}
            </p>
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
          <ClientSearchGrid clients={clients} groups={groups} />
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
