'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Month strip + per-client target pill row that sits above the projects
 * table on `/admin/content-tools`. The strip lets Jack scrub between
 * months; the pills read `monthly_deliverable_slots` for the chosen
 * month and render `<delivered> / <total> <label>` per client per
 * deliverable_type so the board doubles as a target-vs-actual readout.
 *
 * The shell owns `selectedMonth` so other parts of the page (e.g. a
 * future "filter rows by month" toggle) can read the same value, but
 * the fetch + render is contained here to keep the shell terse.
 */

type ClientBucket = {
  client_id: string;
  client_name: string;
  client_logo_url: string | null;
  by_type: Record<
    string,
    {
      type_id: string;
      slug: string;
      label_plural: string;
      total: number;
      delivered: number;
      in_progress: number;
      pending: number;
      skipped: number;
    }
  >;
};

type SummaryResponse = { month: string; clients: ClientBucket[] };

function firstOfMonthUTC(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function shiftMonth(monthStart: string, delta: number): string {
  // monthStart is "YYYY-MM-01"; build a UTC Date and shift by `delta`
  // months. Keeping the math in UTC guards against the day flipping
  // when the local zone is far enough west to roll over midnight.
  const [y, m] = monthStart.split('-').map(Number);
  const next = new Date(Date.UTC(y, (m - 1) + delta, 1));
  return firstOfMonthUTC(next);
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatMonth(monthStart: string): string {
  return MONTH_LABEL.format(new Date(`${monthStart}T00:00:00Z`));
}

interface MonthlyTargetPillsProps {
  selectedMonth: string;
  onMonthChange: (monthStart: string) => void;
  // Refresh tick from the parent so a delivered slot ticks the pill up
  // without forcing a manual reload.
  refreshKey?: number;
}

export function MonthlyTargetPills({
  selectedMonth,
  onMonthChange,
  refreshKey,
}: MonthlyTargetPillsProps) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErrored(false);
      try {
        const res = await fetch(
          `/api/admin/editing/monthly-summary?month=${selectedMonth}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error('summary_fetch_failed');
        const body = (await res.json()) as SummaryResponse;
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, refreshKey]);

  const currentMonth = firstOfMonthUTC(new Date());
  const isCurrent = selectedMonth === currentMonth;

  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">
            Monthly targets
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            How each brand is tracking against their package this month
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Previous month"
            onClick={() => onMonthChange(shiftMonth(selectedMonth, -1))}
          >
            <ChevronLeft size={14} />
          </Button>
          <button
            type="button"
            onClick={() => onMonthChange(currentMonth)}
            className={`min-w-[7rem] rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              isCurrent
                ? 'bg-accent/10 text-accent-text'
                : 'text-text-primary hover:bg-surface-2'
            }`}
          >
            {formatMonth(selectedMonth)}
            {isCurrent ? ' (current)' : ''}
          </button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next month"
            onClick={() => onMonthChange(shiftMonth(selectedMonth, 1))}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </header>

      <div className="px-4 py-3">
        {errored ? (
          <p className="text-xs text-text-muted">
            Couldn&apos;t load this month&apos;s targets. Try refreshing.
          </p>
        ) : loading && !data ? (
          <p className="text-xs text-text-muted">Loading targets...</p>
        ) : !data || data.clients.length === 0 ? (
          <p className="text-xs text-text-muted">
            No package targets for {formatMonth(selectedMonth)}. The 1st-of-month
            cron generates these automatically for clients on a tier; ad-hoc
            clients show up here once they&apos;re assigned a package.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.clients.map((c) => (
              <li
                key={c.client_id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2"
              >
                <span className="min-w-[8rem] shrink-0 truncate text-sm font-medium text-text-primary">
                  {c.client_name}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.values(c.by_type).map((t) => (
                    <TargetPill
                      key={t.type_id}
                      delivered={t.delivered}
                      total={t.total}
                      label={t.label_plural}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function TargetPill({
  delivered,
  total,
  label,
}: {
  delivered: number;
  total: number;
  label: string;
}) {
  const ratio = total > 0 ? delivered / total : 0;
  const tone =
    delivered === 0
      ? 'border-border bg-surface-2 text-text-muted'
      : ratio >= 1
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : 'border-accent/30 bg-accent/10 text-accent-text';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${tone}`}
    >
      <span className="font-semibold tabular-nums">
        {delivered} / {total}
      </span>
      <span className="lowercase">{label}</span>
    </span>
  );
}
