/**
 * RecentActivity — calm activity feed replacing the old credits ledger table.
 *
 * Renders `RecentActivityEntry[]` from `lib/deliverables/get-recent-activity.ts`.
 * The PRD asked for a feed that reads like a billing statement, not an audit
 * log: per-row headline + soft secondary detail + a relative timestamp.
 *
 * Sign affordances:
 *   • Positive deltas (refunds, top-ups, monthly grants) get a faint
 *     emerald-300 marker.
 *   • Negative deltas (consumes, expirations) get a faint coral-300 marker.
 *   • Zero-delta rows (theoretical, e.g. Rush SLA modifier in Phase D) get
 *     a neutral muted marker.
 *
 * The component is presentational: empty / loading states are owned by the
 * parent page so this stays trivial to compose into other surfaces.
 */

import type { RecentActivityEntry } from '@/lib/deliverables/get-recent-activity';
import { deliverableCopy } from '@/lib/deliverables/copy';

interface RecentActivityProps {
  entries: RecentActivityEntry[];
  /** When provided, prefixes the section description with the brand name. */
  brandName?: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const ageMs = now - d.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (ageMs < oneDay) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (ageMs < 7 * oneDay) {
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function RecentActivity({ entries, brandName }: RecentActivityProps) {
  return (
    <section className="rounded-2xl border border-nativz-border bg-surface p-6">
      <header className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Recent activity
        </p>
        <h2 className="text-lg font-semibold text-text-primary">
          {brandName ? `${brandName}'s production log` : 'Production log'}
        </h2>
        <p className="text-[13px] text-text-secondary">
          The last {entries.length} movements across this month's scope.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="mt-5 text-[13px] text-text-muted">
          Nothing to show yet. Activity will appear here as deliverables are produced and
          approved.
        </p>
      ) : (
        <ol className="mt-5 space-y-3">
          {entries.map((e) => {
            const tone =
              e.delta > 0
                ? 'bg-emerald-300/60'
                : e.delta < 0
                  ? 'bg-coral-300/60'
                  : 'bg-text-muted/60';
            const copy = deliverableCopy(e.deliverableTypeSlug);
            return (
              <li
                key={e.id}
                className="flex items-start gap-3 rounded-xl border border-nativz-border/60 bg-background/40 p-3"
              >
                <span
                  aria-hidden
                  className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${tone}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-text-primary">{e.headline}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted">
                    <span>{copy.shortLabel}</span>
                    <span aria-hidden>·</span>
                    <span>{formatWhen(e.createdAt)}</span>
                    {e.detail ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{e.detail}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
