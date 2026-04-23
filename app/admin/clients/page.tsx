import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { ClientSearchGrid } from '@/components/clients/client-search-grid';
import {
  SectionTabs,
  SectionHeader,
  SectionPanel,
} from '@/components/admin/section-tabs';
import {
  CLIENTS_TABS,
  CLIENTS_TAB_SLUGS,
  type ClientsTabSlug,
} from '@/components/admin/clients/clients-tabs';
import { ClientsOverviewTab } from '@/components/admin/clients/overview-tab';
import { RefreshButton } from '@/components/admin/shared/refresh-button';
import { refreshClients } from './actions';

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

function resolveTab(raw: string | undefined): ClientsTabSlug {
  if (raw && (CLIENTS_TAB_SLUGS as readonly string[]).includes(raw)) {
    return raw as ClientsTabSlug;
  }
  return 'overview';
}

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  try {
    const adminClient = createAdminClient();

    const supabase = await createServerSupabaseClient();
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    let isSuperAdmin = false;
    if (currentUser) {
      const { data: sa } = await adminClient.from('users').select('is_super_admin').eq('id', currentUser.id).single();
      isSuperAdmin = sa?.is_super_admin === true;
    }

    const sp = await searchParams;
    const activeTab = resolveTab(sp.tab);

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
      <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
        <SectionHeader
          title="Clients"
          description={`Manage your client roster and brand profiles${clients.length > 0 ? ` · ${clients.length} total` : ''}. Pick a tab to drill in.`}
          action={
            <div className="flex items-center gap-2">
              <RefreshButton action={refreshClients} />
              {isSuperAdmin ? (
                <Link href="/admin/clients/onboard">
                  <Button size="sm">
                    <Plus size={14} />
                    Onboard
                  </Button>
                </Link>
              ) : null}
            </div>
          }
        />

        <SectionTabs tabs={CLIENTS_TABS} active={activeTab} memoryKey="cortex:clients:last-tab" />

        <div>
          {activeTab === 'overview' ? (
            <ClientsOverviewTab />
          ) : activeTab === 'groups' ? (
            <SectionPanel
              title="Pipeline groups"
              description={`${groups.length} group${groups.length === 1 ? '' : 's'} defining board columns and segmentation.`}
            >
              {groups.length === 0 ? (
                <p className="text-sm text-text-muted">No groups yet.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {groups.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center gap-3 rounded-xl border border-nativz-border bg-surface px-4 py-3"
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: g.color || '#888' }}
                      />
                      <span className="text-sm font-medium text-text-primary">{g.name}</span>
                      <span className="ml-auto tabular-nums text-xs text-text-muted">#{g.sort_order}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionPanel>
          ) : (
            <SectionPanel
              title="All clients"
              description={`${clients.length} client${clients.length === 1 ? '' : 's'} on the roster.`}
            >
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
            </SectionPanel>
          )}
        </div>
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
