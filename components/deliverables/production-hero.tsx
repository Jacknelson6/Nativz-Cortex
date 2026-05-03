/**
 * ProductionHero — top-of-page KPI tiles.
 *
 * One tile per active deliverable type, each showing:
 *   • {plural} remaining / {monthly_allowance}
 *   • Reset date
 *   • Rollover policy summary
 *
 * Tiles aren't `KpiTile` because the existing primitive expects a single
 * scalar; here each tile carries two numbers + a context line. Visual
 * language stays sibling to KpiTile so the page feels like the rest of
 * /admin/clients/[slug]: same `bg-surface` card, same border, same
 * accent header.
 */

import { CalendarClock, RefreshCcw } from 'lucide-react';
import type { DeliverableBalance } from '@/lib/deliverables/get-balances';
import { deliverableCopy } from '@/lib/deliverables/copy';

interface ProductionHeroProps {
  brandName: string;
  tierLabel: string;
  tierBlurb: string;
  balances: DeliverableBalance[];
}

function rolloverSummary(b: DeliverableBalance): string {
  if (b.rolloverPolicy === 'unlimited') return 'Unlimited rollover';
  if (b.rolloverPolicy === 'cap')
    return `Carries up to ${b.rolloverCap ?? 0}`;
  return 'Resets each month';
}

function resetLabel(iso: string | null): string {
  if (!iso) return 'Pending first reset';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function ProductionHero({
  brandName,
  tierLabel,
  tierBlurb,
  balances,
}: ProductionHeroProps) {
  const visible = balances
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section className="rounded-2xl border border-nativz-border bg-surface p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 shrink space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
            {tierLabel} tier
          </p>
          <h2 className="text-lg font-semibold text-text-primary">
            {brandName}&apos;s production this month
          </h2>
          <p className="max-w-prose text-[13px] text-text-secondary">{tierBlurb}</p>
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((b) => {
          const copy = deliverableCopy(b.deliverableTypeSlug);
          const allowance = b.monthlyAllowance;
          const remaining = b.currentBalance;
          const utilisation =
            allowance > 0
              ? Math.max(0, Math.min(1, (allowance - Math.max(0, remaining)) / allowance))
              : 0;
          const tone =
            !b.hasRow
              ? 'text-text-muted'
              : remaining < 0
                ? 'text-coral-300'
                : remaining === 0
                  ? 'text-amber-300'
                  : 'text-text-primary';

          return (
            <li
              key={b.deliverableTypeId}
              className="rounded-xl border border-nativz-border bg-background/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-text-muted">
                    {copy.shortLabel}
                  </p>
                  <p className={`mt-1 font-mono text-2xl ${tone}`}>
                    {b.hasRow ? remaining : '—'}
                    {b.hasRow ? (
                      <span className="ml-1 text-[13px] font-normal text-text-muted">
                        / {allowance}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[12px] text-text-secondary">
                    {b.hasRow
                      ? `${copy.plural} remaining`
                      : 'Not active on this account yet'}
                  </p>
                </div>
              </div>

              {b.hasRow ? (
                <>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-accent-text/60"
                      style={{ width: `${Math.round(utilisation * 100)}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={11} />
                      Resets {resetLabel(b.nextResetAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <RefreshCcw size={11} />
                      {rolloverSummary(b)}
                    </span>
                  </div>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
