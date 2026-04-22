import { notFound } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { OnboardingRosterTable } from '@/components/onboarding/onboarding-roster-table';

export const dynamic = 'force-dynamic';

type TrackerRow = {
  id: string;
  client_id: string;
  service: string;
  title: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  clients: { name: string; slug: string; logo_url: string | null } | null;
};

/**
 * /admin/onboarding — top-level admin tool that lists every onboarding
 * tracker across all clients. Dedicated admin surface (not per-client)
 * so the ops team can triage everything in flight from one screen.
 */
export default async function OnboardingRosterPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') notFound();

  // Clients list drives the "Start new tracker" flow (pick client + service).
  const [{ data: trackersRaw }, { data: clientsRaw }] = await Promise.all([
    admin
      .from('onboarding_trackers')
      .select('id, client_id, service, title, status, started_at, completed_at, created_at, clients!inner(name, slug, logo_url)')
      .order('created_at', { ascending: false }),
    admin
      .from('clients')
      .select('id, name, slug, services')
      .order('name', { ascending: true }),
  ]);

  const trackers = (trackersRaw as TrackerRow[] | null) ?? [];
  const clients = (clientsRaw ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
    services: Array.isArray(c.services) ? (c.services as string[]) : [],
  }));

  return (
    <div className="cortex-page-gutter space-y-6">
      <div>
        <h1 className="ui-page-title flex items-center gap-2">
          <ListChecks size={22} className="text-accent-text" />
          Onboarding
        </h1>
        <p className="text-[15px] text-text-muted mt-1">
          Track per-service setup for every client — checklist + timeline + shareable client view.
        </p>
      </div>

      <OnboardingRosterTable trackers={trackers} clients={clients} />
    </div>
  );
}
