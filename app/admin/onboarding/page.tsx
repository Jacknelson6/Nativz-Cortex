/**
 * /admin/onboarding
 *
 * Roster of onboardings, filterable by status. The default view is
 * Active (in_progress + paused). A status tab strip lets admins flip to
 * Completed or Archived so a finished onboarding never disappears from
 * the surface — the share link, step state, and email log all stay
 * reachable via the row.
 *
 * "New onboarding" opens a client picker modal that POSTs to
 * /api/admin/onboardings.
 */

import Link from 'next/link';
import { Workflow } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { listOnboardingsForAdmin, describeProgress } from '@/lib/onboarding/api';
import type { OnboardingStatus } from '@/lib/onboarding/types';
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

type StatusFilter = 'active' | 'completed' | 'abandoned';

const STATUS_TABS: Array<{ key: StatusFilter; label: string; statuses: OnboardingStatus[] }> = [
  { key: 'active', label: 'Active', statuses: ['in_progress', 'paused'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'abandoned', label: 'Abandoned', statuses: ['abandoned'] },
];

function isStatusFilter(v: string | undefined): v is StatusFilter {
  return v === 'active' || v === 'completed' || v === 'abandoned';
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

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function AdminOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const activeFilter: StatusFilter = isStatusFilter(statusParam) ? statusParam : 'active';
  const statuses = STATUS_TABS.find((t) => t.key === activeFilter)?.statuses ?? ['in_progress', 'paused'];

  const admin = createAdminClient();

  const [rosterRows, clientRows] = await Promise.all([
    listOnboardingsForAdmin({ status: statuses }),
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

  const isHistorical = activeFilter !== 'active';

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <SectionHeader
        title="Onboarding"
        action={<OnboardingNewButton clients={clients} />}
      />

      <div className="flex items-center gap-1 border-b border-nativz-border">
        {STATUS_TABS.map((tab) => {
          const active = tab.key === activeFilter;
          const href = tab.key === 'active' ? '/admin/onboarding' : `/admin/onboarding?status=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={
                active
                  ? 'inline-flex items-center px-3 py-2 text-sm font-medium text-text-primary border-b-2 border-accent -mb-px'
                  : 'inline-flex items-center px-3 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors'
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {rosterRows.length === 0 ? (
        <EmptyState
          icon={<Workflow size={32} />}
          title={
            activeFilter === 'completed'
              ? 'No completed onboardings yet'
              : activeFilter === 'abandoned'
              ? 'Nothing abandoned'
              : 'No onboardings in flight'
          }
          description={
            activeFilter === 'active'
              ? 'Start one for any active client to walk them through brand basics, social accounts, and a kickoff time.'
              : 'Finished or abandoned onboardings stay here so the share link, step state, and email log are always reachable.'
          }
          action={activeFilter === 'active' ? <OnboardingNewButton clients={clients} /> : undefined}
        />
      ) : (
        <div className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1.1fr)_5.5rem] items-center gap-4 px-4 py-3 text-[11px] uppercase tracking-wide text-text-secondary border-b border-nativz-border">
            <div>Client</div>
            <div>Kind</div>
            <div>Progress</div>
            <div>{isHistorical ? 'Completed' : 'Last email'}</div>
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
                className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1.1fr)_5.5rem] items-center gap-4 px-4 py-3 border-b border-nativz-border last:border-b-0 hover:bg-surface-hover transition-colors max-md:flex max-md:flex-col max-md:items-start max-md:gap-2"
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
                  {isHistorical
                    ? shortDate(row.completed_at ?? row.updated_at)
                    : relTime(row.last_email_at)}
                </div>
                <div className="flex justify-end">
                  <StatusPill status={row.status} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: OnboardingStatus }) {
  if (status === 'paused') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
        Paused
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
        Completed
      </span>
    );
  }
  if (status === 'abandoned') {
    return (
      <span className="inline-flex items-center rounded-full bg-text-muted/15 px-2 py-0.5 text-[11px] font-medium text-text-muted">
        Abandoned
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-text">
      Active
    </span>
  );
}
