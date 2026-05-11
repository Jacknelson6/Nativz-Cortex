/**
 * /admin/onboarding
 *
 * Roster of in-flight onboardings. Each row links to the detail page.
 * "New onboarding" opens a client picker modal that POSTs to
 * /api/admin/onboardings.
 */

import Link from 'next/link';
import { Workflow } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { listOnboardingsForAdmin, describeProgress } from '@/lib/onboarding/api';
import { SectionHeader } from '@/components/admin/section-tabs';
import { EmptyState } from '@/components/shared/empty-state';
import { OnboardingNewButton } from '@/components/onboarding/onboarding-new-button';
import { ClientLogo } from '@/components/clients/client-logo';

export const dynamic = 'force-dynamic';

interface ClientLite {
  id: string;
  name: string;
  slug: string;
  agency: string | null;
}

function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function AdminOnboardingPage() {
  const admin = createAdminClient();

  const [rosterRows, clientRows] = await Promise.all([
    listOnboardingsForAdmin({ status: ['in_progress', 'paused'] }),
    admin
      .from('clients')
      .select('id, name, slug, agency')
      .eq('is_active', true)
      .order('name'),
  ]);

  const clients: ClientLite[] = ((clientRows.data ?? []) as ClientLite[]).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    agency: c.agency ?? null,
  }));

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <SectionHeader
        title="Onboarding"
        action={<OnboardingNewButton clients={clients} />}
      />

      {rosterRows.length === 0 ? (
        <EmptyState
          icon={<Workflow size={32} />}
          title="No onboardings in flight"
          description="Start one for any active client to walk them through brand basics, social accounts, and a kickoff time."
          action={<OnboardingNewButton clients={clients} />}
        />
      ) : (
        <div className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
          <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_5.5rem] items-center gap-4 px-4 py-3 text-[11px] uppercase tracking-wide text-text-secondary border-b border-nativz-border">
            <div>Client</div>
            <div>Kind</div>
            <div>Progress</div>
            <div>Last email</div>
            <div className="text-right">Status</div>
          </div>
          {rosterRows.map((row) => {
            const progress = describeProgress(row);
            const clientName = row.client?.name ?? 'Unknown';
            const slug = row.client?.slug;
            const logoUrl = row.client?.logo_url ?? null;
            return (
              <Link
                key={row.id}
                href={`/admin/onboarding/${row.id}`}
                className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_5.5rem] items-center gap-4 px-4 py-3 border-b border-nativz-border last:border-b-0 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ClientLogo src={logoUrl} name={clientName} size="sm" className="shrink-0" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-text-primary">{clientName}</span>
                    {slug ? (
                      <span className="truncate text-xs text-text-muted">/{slug}</span>
                    ) : null}
                  </div>
                </div>
                <div className="text-sm text-text-secondary capitalize">
                  {row.kind}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex-1 h-1.5 rounded-full bg-background overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${Math.max(progress.pct, 4)}%` }}
                    />
                  </div>
                  <span className="text-xs text-text-secondary tabular-nums whitespace-nowrap">
                    {progress.current_step + 1}/{progress.total}
                  </span>
                </div>
                <div className="text-sm text-text-secondary truncate">
                  {relTime(row.last_email_at)}
                </div>
                <div className="flex justify-end">
                  <span
                    className={
                      row.status === 'paused'
                        ? 'inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300'
                        : 'inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-text'
                    }
                  >
                    {row.status === 'paused' ? 'Paused' : 'Active'}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
