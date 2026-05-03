'use client';

/**
 * AdminMarginView - per-editor margin breakdown for the active client.
 *
 * Fetches `/api/deliverables/[clientId]/margin?period_start=&period_end=`
 * and renders one row per editor that consumed at least one deliverable
 * in the window. Columns:
 *   • Editor (avatar + name)
 *   • Deliverables this period
 *   • Estimated hours
 *   • Cost
 *   • Revenue
 *   • Margin (revenue - cost)
 *
 * Editors with NULL `cost_rate_cents_per_hour` show "rate missing" in the
 * cost / margin cells instead of zeroes - the operator needs to see "you
 * forgot to set a rate for this person" not "this editor produced free
 * deliverables." See `lib/deliverables/get-margin.ts` for the math.
 *
 * Period defaults to the current calendar month. Admin can pick a custom
 * window via the two date inputs at the top, no submit button, just
 * react-on-change with a debounce-via-fetch-cancel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MarginRow {
  editorUserId: string;
  fullName: string;
  avatarUrl: string | null;
  deliverables: number;
  estimatedHours: number;
  costCents: number | null;
  revenueCents: number;
  marginCents: number | null;
  rateMissing: boolean;
}

interface MarginSnapshot {
  rows: MarginRow[];
  totals: {
    deliverables: number;
    estimatedHours: number;
    costCents: number;
    revenueCents: number;
    marginCents: number;
  };
  periodStart: string;
  periodEnd: string;
}

interface Props {
  clientId: string;
}

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    start: toLocalInput(start),
    end: toLocalInput(end),
  };
}

/** Format Date as YYYY-MM-DDTHH:MM for `<input type="datetime-local">`. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtUsd(cents: number | null): string {
  if (cents == null) return '—';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function AdminMarginView({ clientId }: Props) {
  const initial = useMemo(defaultPeriod, []);
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);
  const [snapshot, setSnapshot] = useState<MarginSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);
    try {
      const startIso = new Date(periodStart).toISOString();
      const endIso = new Date(periodEnd).toISOString();
      const res = await fetch(
        `/api/deliverables/${clientId}/margin?period_start=${encodeURIComponent(startIso)}&period_end=${encodeURIComponent(endIso)}`,
        { signal: ac.signal },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }
      const json = (await res.json()) as MarginSnapshot;
      setSnapshot(json);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load margin');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [clientId, periodStart, periodEnd]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const totals = snapshot?.totals;

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Margin by editor</h2>
          <p className="mt-1 text-[12px] text-text-muted">
            Revenue minus cost per editor for the selected window. Hours estimated from drop-video
            timestamps, clamped 0.25 to 8 per deliverable. Editors without a cost rate show as
            &quot;rate missing&quot; so they don&apos;t silently zero the math.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">From</span>
            <input
              type="datetime-local"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">To</span>
            <input
              type="datetime-local"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        </div>
      </header>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-coral-300/30 bg-coral-300/5 p-3 text-sm text-coral-300">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading && !snapshot ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading margin data...
        </div>
      ) : null}

      {snapshot && snapshot.rows.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">
          No editor-attributed deliverables in this window. Either nothing shipped, or the consume
          rows are missing editor attribution (older rows may pre-date attribution backfill).
        </p>
      ) : null}

      {snapshot && snapshot.rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="py-2 font-medium">Editor</th>
                <th className="py-2 text-right font-medium">Deliverables</th>
                <th className="py-2 text-right font-medium">Hours</th>
                <th className="py-2 text-right font-medium">Cost</th>
                <th className="py-2 text-right font-medium">Revenue</th>
                <th className="py-2 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {snapshot.rows.map((r) => (
                <tr key={r.editorUserId}>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      {r.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.avatarUrl}
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background text-[10px] font-semibold text-text-secondary">
                          {initials(r.fullName)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-text-primary">{r.fullName}</p>
                        {r.rateMissing ? (
                          <p className="text-[10px] text-amber-300">rate missing</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-right font-mono text-text-secondary">
                    {r.deliverables}
                  </td>
                  <td className="py-2 text-right font-mono text-text-secondary">
                    {r.estimatedHours.toFixed(1)}
                  </td>
                  <td className="py-2 text-right font-mono text-text-secondary">
                    {r.rateMissing ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      fmtUsd(r.costCents)
                    )}
                  </td>
                  <td className="py-2 text-right font-mono text-text-secondary">
                    {fmtUsd(r.revenueCents)}
                  </td>
                  <td
                    className={`py-2 text-right font-mono ${
                      r.marginCents == null
                        ? 'text-text-muted'
                        : r.marginCents >= 0
                          ? 'text-emerald-300'
                          : 'text-coral-300'
                    }`}
                  >
                    {fmtUsd(r.marginCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            {totals ? (
              <tfoot className="border-t border-white/10 text-[12px]">
                <tr>
                  <th className="py-2 text-left font-semibold text-text-primary">Totals</th>
                  <td className="py-2 text-right font-mono font-semibold text-text-primary">
                    {totals.deliverables}
                  </td>
                  <td className="py-2 text-right font-mono font-semibold text-text-primary">
                    {totals.estimatedHours.toFixed(1)}
                  </td>
                  <td className="py-2 text-right font-mono font-semibold text-text-primary">
                    {fmtUsd(totals.costCents)}
                  </td>
                  <td className="py-2 text-right font-mono font-semibold text-text-primary">
                    {fmtUsd(totals.revenueCents)}
                  </td>
                  <td
                    className={`py-2 text-right font-mono font-semibold ${
                      totals.marginCents >= 0 ? 'text-emerald-300' : 'text-coral-300'
                    }`}
                  >
                    {fmtUsd(totals.marginCents)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}
    </section>
  );
}
