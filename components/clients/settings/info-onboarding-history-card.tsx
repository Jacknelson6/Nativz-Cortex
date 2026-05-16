import Link from 'next/link';
import { ChevronRight, Workflow } from 'lucide-react';
import { InfoCard } from './info-card';
import { listOnboardings } from '@/lib/onboarding/api';
import type { OnboardingRow } from '@/lib/onboarding/types';
import { SCREENS } from '@/lib/onboarding/screens';

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusPill(status: OnboardingRow['status']) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium';
  if (status === 'completed') return `${base} bg-emerald-500/15 text-emerald-300`;
  if (status === 'paused') return `${base} bg-amber-500/15 text-amber-300`;
  if (status === 'abandoned') return `${base} bg-text-muted/15 text-text-muted`;
  return `${base} bg-accent/15 text-accent-text`;
}

function statusLabel(status: OnboardingRow['status']): string {
  if (status === 'in_progress') return 'Active';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export async function InfoOnboardingHistoryCard({ clientId }: { clientId: string }) {
  const rows = await listOnboardings({ client_id: clientId });

  return (
    <InfoCard
      icon={<Workflow size={16} />}
      title="Onboarding history"
      description="Every onboarding ever started for this client — active, paused, completed, or abandoned. Open any row to inspect step state, email log, and the client-facing share link."
    >
      {rows.length === 0 ? (
        <p className="text-sm italic text-text-muted py-3">
          No onboarding has been started for this client.
        </p>
      ) : (
        <ul className="divide-y divide-nativz-border/60">
          {rows.map((row) => {
            const screens = SCREENS[row.kind] ?? [];
            const total = screens.length;
            const current = Math.min(row.current_step + 1, Math.max(total, 1));
            const primaryDate = row.completed_at ?? row.started_at ?? row.created_at;
            return (
              <li key={row.id}>
                <Link
                  href={`/admin/onboarding/${row.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm text-text-primary capitalize truncate">
                        {row.kind} onboarding
                      </p>
                      <span className={statusPill(row.status)}>{statusLabel(row.status)}</span>
                    </div>
                    <div className="text-xs text-text-muted truncate">
                      {row.status === 'completed' ? 'Completed' : 'Started'} {shortDate(primaryDate)}
                      {total > 0 && row.status !== 'completed' && (
                        <> · step {current} of {total}</>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className="shrink-0 text-text-muted group-hover:text-text-primary transition-colors"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </InfoCard>
  );
}
