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
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-4 py-3 text-xs uppercase tracking-wide text-muted border-b border-border">
            <div className="col-span-4">Client</div>
            <div className="col-span-2">Kind</div>
            <div className="col-span-3">Progress</div>
            <div className="col-span-2">Last email</div>
            <div className="col-span-1 text-right">Status</div>
          </div>
          {rosterRows.map((row) => {
            const progress = describeProgress(row);
            const clientName = row.client?.name ?? 'Unknown';
            const slug = row.client?.slug;
            return (
              <Link
                key={row.id}
                href={`/admin/onboarding/${row.id}`}
                className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-background transition-colors"
              >
                <div className="col-span-4 flex flex-col">
                  <span className="text-sm text-foreground">{clientName}</span>
                  {slug ? (
                    <span className="text-xs text-muted">/{slug}</span>
                  ) : null}
                </div>
                <div className="col-span-2 text-sm text-muted capitalize">
                  {row.kind}
                </div>
                <div className="col-span-3 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-background overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {progress.current_step + 1}/{progress.total}
                  </span>
                </div>
                <div className="col-span-2 text-sm text-muted">
                  {relTime(row.last_email_at)}
                </div>
                <div className="col-span-1 text-right">
                  <span
                    className={
                      row.status === 'paused'
                        ? 'text-xs text-amber-400'
                        : 'text-xs text-accent-text'
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
