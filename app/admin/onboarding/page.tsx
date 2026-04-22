import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListChecks, Mail } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { OnboardingRosterTable } from '@/components/onboarding/onboarding-roster-table';

export const dynamic = 'force-dynamic';

type TrackerRow = {
  id: string;
  client_id: string | null;
  service: string;
  title: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  is_template: boolean;
  template_name: string | null;
  created_at: string;
  clients: { name: string; slug: string; logo_url: string | null } | null;
};

/**
 * /admin/onboarding — top-level admin tool that lists every onboarding
 * tracker across all clients. Dedicated admin surface (not per-client)
 * so the ops team can triage everything in flight from one screen.
 *
 * ?view=templates flips the roster to show service templates (reusable
 * presets) instead of real trackers. Same editor handles both.
 */
export default async function OnboardingRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const view: 'trackers' | 'templates' = sp.view === 'templates' ? 'templates' : 'trackers';

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') notFound();

  const [{ data: trackersRaw }, { data: clientsRaw }] = await Promise.all([
    admin
      .from('onboarding_trackers')
      .select('id, client_id, service, title, status, started_at, completed_at, is_template, template_name, created_at, clients(name, slug, logo_url)')
      .eq('is_template', view === 'templates')
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
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="ui-page-title flex items-center gap-2">
            <ListChecks size={22} className="text-accent-text" />
            Onboarding
          </h1>
          <p className="text-[15px] text-text-muted mt-1">
            Track per-service setup for every client — checklist + timeline + shareable client view.
          </p>
        </div>
        <Link
          href="/admin/onboarding/email-templates"
          className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface-primary px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <Mail size={14} />
          Email templates
        </Link>
      </div>

      {/* Segmented toggle: Trackers | Templates */}
      <div className="inline-flex rounded-full border border-nativz-border bg-surface p-0.5">
        <SegmentLink active={view === 'trackers'} href="/admin/onboarding">
          Trackers
        </SegmentLink>
        <SegmentLink active={view === 'templates'} href="/admin/onboarding?view=templates">
          Templates
        </SegmentLink>
      </div>

      <OnboardingRosterTable trackers={trackers} clients={clients} view={view} />
    </div>
  );
}

function SegmentLink({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-accent-surface text-accent-text'
          : 'text-text-muted hover:text-text-primary'
      }`}
    >
      {children}
    </Link>
  );
}
