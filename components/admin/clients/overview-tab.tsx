import { Activity, Building2, LayoutGrid, Plus, Users } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionTile } from '@/components/admin/section-tabs';

async function loadStats() {
  const admin = createAdminClient();

  const [clientsRes, activeRes, groupsRes] = await Promise.all([
    admin.from('clients').select('id', { count: 'exact', head: true }),
    admin.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('client_groups').select('id', { count: 'exact', head: true }),
  ]);

  const totalClients = clientsRes.count ?? 0;
  const activeClients = activeRes.count ?? 0;
  const groupCount = groupsRes.count ?? 0;

  return { totalClients, activeClients, inactiveClients: totalClients - activeClients, groupCount };
}

export async function ClientsOverviewTab() {
  const s = await loadStats();
  const base = '/admin/clients';

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Client roster + pipeline state. Click a tile to drill in.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SectionTile
          href={`${base}?tab=roster`}
          icon={<Building2 size={18} />}
          title="All clients"
          status={s.totalClients > 0 ? 'ok' : 'soon'}
          primary={`${s.totalClients} client${s.totalClients === 1 ? '' : 's'}`}
          secondary={`${s.activeClients} active · ${s.inactiveClients} inactive`}
        />
        <SectionTile
          href={`${base}?tab=roster`}
          icon={<Activity size={18} />}
          title="Active"
          status={s.activeClients > 0 ? 'ok' : 'warn'}
          primary={`${s.activeClients} client${s.activeClients === 1 ? '' : 's'} live`}
          secondary="Receiving searches + reports"
        />
        <SectionTile
          href={`${base}?tab=groups`}
          icon={<LayoutGrid size={18} />}
          title="Groups"
          primary={`${s.groupCount} pipeline group${s.groupCount === 1 ? '' : 's'}`}
          secondary="For board columns + segmentation"
        />
        <SectionTile
          href="/admin/clients/onboard"
          icon={<Plus size={18} />}
          title="Onboard"
          primary="Add a new client"
          secondary="Kicks off the intake flow"
        />
        <SectionTile
          href="/admin/clients/new"
          icon={<Plus size={18} />}
          title="New client (quick)"
          primary="Create a bare-metadata row"
          secondary="Skip the intake — just name + slug"
        />
        <SectionTile
          href="/admin/onboarding?tab=trackers"
          icon={<Users size={18} />}
          title="Onboarding trackers"
          primary="Per-service setup checklists"
          secondary="Open the onboarding hub"
        />
      </div>
    </div>
  );
}
