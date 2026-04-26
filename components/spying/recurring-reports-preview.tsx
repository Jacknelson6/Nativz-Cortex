import Link from 'next/link';
import { ArrowRight, Mail, Pause } from 'lucide-react';

interface SubscriptionRow {
  id: string;
  client_id: string;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  recipients: string[];
  include_portal_users: boolean;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
  client_name: string;
  client_agency: string | null;
}

function nextRunLabel(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'due now';
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d`;
}

const CADENCE_TONE: Record<string, string> = {
  weekly: 'bg-accent/15 text-accent-text',
  biweekly: 'bg-fuchsia-500/15 text-fuchsia-200',
  monthly: 'bg-amber-500/15 text-amber-200',
};

export function RecurringReportsPreview({
  subscriptions,
  totalCount,
}: {
  subscriptions: SubscriptionRow[];
  totalCount: number;
}) {
  return (
    <section
      className="animate-ci-rise space-y-3"
      style={{ animationDelay: '360ms' }}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="ui-eyebrow text-accent-text/80">Automated</p>
          <h2 className="mt-1 font-display text-base font-semibold text-text-primary">
            Recurring reports
          </h2>
        </div>
        <Link
          href="/spying/reports"
          className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent-text"
        >
          {totalCount > 0 ? `Manage all (${totalCount})` : 'Set up first report'} <ArrowRight size={12} />
        </Link>
      </div>

      {subscriptions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-8 text-center text-sm text-text-muted">
          No recurring reports yet —{' '}
          <Link href="/spying/reports/new" className="text-accent-text underline decoration-dotted">
            schedule a branded competitor update
          </Link>{' '}
          for any client.
        </div>
      ) : (
        <ul className="divide-y divide-nativz-border/60 overflow-hidden rounded-xl border border-nativz-border bg-surface">
          {subscriptions.slice(0, 4).map((s) => (
            <li key={s.id}>
              <Link
                href="/spying/reports"
                className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-hover/40 focus-visible:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-[11px] font-bold text-accent-text">
                  {s.client_name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-sm font-semibold text-text-primary">
                    {s.client_name}
                    {s.client_agency ? (
                      <span className="ml-1 font-normal text-text-muted">· {s.client_agency}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    <Mail size={11} className="text-text-muted/70" />
                    <span>
                      {s.recipients.length} {s.recipients.length === 1 ? 'recipient' : 'recipients'}
                      {s.include_portal_users ? ' + portal' : ''}
                    </span>
                  </div>
                </div>
                <span
                  className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide sm:inline ${CADENCE_TONE[s.cadence] ?? CADENCE_TONE.weekly}`}
                >
                  {s.cadence}
                </span>
                <span className="hidden shrink-0 font-mono text-[10px] text-text-muted sm:inline">
                  {s.enabled ? (
                    `Next ${nextRunLabel(s.next_run_at)}`
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-300/80">
                      <Pause size={10} /> paused
                    </span>
                  )}
                </span>
                <ArrowRight
                  size={13}
                  className="shrink-0 text-text-muted/40 transition-all group-hover:translate-x-0.5 group-hover:text-accent-text"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
