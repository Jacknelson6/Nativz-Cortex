import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { ClientSearchGrid } from '@/components/clients/client-search-grid';
import { SectionHeader } from '@/components/admin/section-tabs';

export const dynamic = 'force-dynamic';

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

    const supabase = await createServerSupabaseClient();
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    let isSuperAdmin = false;
    if (currentUser) {
      const { data: sa } = await adminClient.from('users').select('is_super_admin').eq('id', currentUser.id).single();
      isSuperAdmin = sa?.is_super_admin === true;
    }

    const [
      { data: dbClients, error: dbError },
      { data: groupsData },
      { data: activeTrackers },
    ] = await Promise.all([
      selectClientsWithRosterVisibility<AdminClientsDbRow>(adminClient, {
        select: 'id, name, slug, industry, is_active, logo_url, services, agency, health_score, organization_id, group_id',
        orderBy: { column: 'name' },
      }),
      adminClient
        .from('client_groups')
        .select('id, name, color, sort_order')
        .order('sort_order', { ascending: true }) as unknown as { data: ClientGroupRow[] | null },
      // Trackers in flight — anything not completed or archived. We derive the
      // "Onboarding" row from this set so a tracker hitting completed anywhere
      // in the app auto-removes the client from that row on next render.
      adminClient
        .from('onboarding_trackers')
        .select('client_id')
        .in('status', ['active', 'paused'])
        .not('client_id', 'is', null),
    ]);

    if (dbError) {
      console.error('Database error fetching clients:', JSON.stringify(dbError, null, 2));
      throw dbError;
    }

    const groups = (groupsData ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      sort_order: g.sort_order,
    }));

    const onboardingClientIds = new Set(
      (activeTrackers ?? []).map((t) => t.client_id).filter((id): id is string => Boolean(id)),
    );

    const clients = (dbClients ?? []).map((c) => ({
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
      inOnboarding: onboardingClientIds.has(c.id),
    }));

    return (
      <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Clients"
          description={`Manage your client roster and brand profiles${clients.length > 0 ? ` · ${clients.length} total` : ''}.`}
          action={
            isSuperAdmin ? (
              <Link href="/admin/clients/onboard">
                <Button size="sm">
                  <Plus size={14} />
                  Onboard
                </Button>
              </Link>
            ) : null
          }
        />

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
