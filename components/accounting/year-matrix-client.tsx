'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { centsToDollars } from '@/lib/accounting/periods';

// 'override' / 'misc' still exist in the DB for legacy rows but aren't
// surfaced as filters here.
type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging';
type ServiceFilter = 'all' | EntryType;

interface Entry {
  id: string;
  entry_type: EntryType | 'override' | 'misc';
  team_member_id: string | null;
  payee_label: string | null;
  amount_cents: number;
  period_id: string;
}
interface Period {
  id: string;
  start_date: string;
  half: 'first-half' | 'second-half';
}
interface Member { id: string; full_name: string | null }

interface YearMatrixClientProps {
  year: number;
  periods: Period[];
  members: Member[];
  entries: Entry[];
}

const SERVICES: Array<{ key: ServiceFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'editing', label: 'Editing' },
  { key: 'smm', label: 'SMM' },
  { key: 'affiliate', label: 'Affiliate' },
  { key: 'blogging', label: 'Blogging' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Displays a 24-row matrix — 12 months × two halves — with every active
 * team member as a column and an "Other payees" column for freelancer /
 * affiliate line items. Each cell is a link to the matching period if one
 * exists. Service filter at the top narrows entries to a single type so
 * you can audit payroll per discipline.
 */
export function YearMatrixClient({ year, periods, members, entries }: YearMatrixClientProps) {
  const [service, setService] = useState<ServiceFilter>('all');

  // Reduce entries to cell totals keyed (monthIndex, half, columnKey).
  // columnKey = member id OR "other:<label>" for non-member payees.
  const { cells, periodByKey, otherPayeeColumns } = useMemo(() => {
    const cells = new Map<string, number>();
    const otherPayees = new Map<string, number>(); // label → total across year
    const periodByKey = new Map<string, string>();

    const periodById = new Map(periods.map((p) => [p.id, p]));
    for (const p of periods) {
      const [, m] = p.start_date.split('-').map(Number);
      periodByKey.set(`${m - 1}:${p.half}`, p.id);
    }

    for (const e of entries) {
      // Skip legacy override/misc rows entirely — they no longer surface.
      if (e.entry_type === 'override' || e.entry_type === 'misc') continue;
      if (service !== 'all' && e.entry_type !== service) continue;
      const period = periodById.get(e.period_id);
      if (!period) continue;
      const [, m] = period.start_date.split('-').map(Number);
      const col = e.team_member_id ?? `other:${(e.payee_label ?? 'Unassigned').trim()}`;
      const key = `${m - 1}:${period.half}:${col}`;
      cells.set(key, (cells.get(key) ?? 0) + (e.amount_cents ?? 0));

      if (!e.team_member_id) {
        otherPayees.set(col, (otherPayees.get(col) ?? 0) + (e.amount_cents ?? 0));
      }
    }

    // Only surface "other payees" as columns when they actually have
    // entries for the current filter.
    const otherPayeeColumns = Array.from(otherPayees.entries())
      .filter(([, total]) => total > 0)
      .map(([col]) => col)
      .sort();

    return { cells, periodByKey, otherPayeeColumns };
  }, [entries, periods, service]);

  // Column list: active members + other-payee buckets.
  const columns: Array<{ key: string; label: string; kind: 'member' | 'other' }> = useMemo(() => {
    const memberCols = members.map((m) => ({
      key: m.id,
      label: m.full_name ?? 'Unnamed',
      kind: 'member' as const,
    }));
    const otherCols = otherPayeeColumns.map((c) => ({
      key: c,
      label: c.replace(/^other:/, ''),
      kind: 'other' as const,
    }));
    return [...memberCols, ...otherCols];
  }, [members, otherPayeeColumns]);

  // Per-month 1st + 2nd half rows. Rows where every cell is 0 for the
  // active service get collapsed out to keep the grid readable.
  const rows = useMemo(() => {
    const out: Array<{
      month: number;
      half: 'first-half' | 'second-half';
      periodId: string | undefined;
      values: Record<string, number>;
      total: number;
    }> = [];
    for (let m = 0; m < 12; m++) {
      for (const half of ['first-half', 'second-half'] as const) {
        const values: Record<string, number> = {};
        let total = 0;
        for (const col of columns) {
          const v = cells.get(`${m}:${half}:${col.key}`) ?? 0;
          values[col.key] = v;
          total += v;
        }
        out.push({
          month: m,
          half,
          periodId: periodByKey.get(`${m}:${half}`),
          values,
          total,
        });
      }
    }
    return out;
  }, [cells, columns, periodByKey]);

  const columnTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const col of columns) out[col.key] = 0;
    for (const r of rows) {
      for (const col of columns) out[col.key] += r.values[col.key] ?? 0;
    }
    return out;
  }, [rows, columns]);

  const grandTotal = useMemo(
    () => Object.values(columnTotals).reduce((a, b) => a + b, 0),
    [columnTotals],
  );

  return (
    <div className="space-y-4">
      {/* Service tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-nativz-border">
        {SERVICES.map((s) => {
          const active = s.key === service;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setService(s.key)}
              className={`relative px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                active ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {s.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {columns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-nativz-border bg-surface px-4 py-12 text-center text-sm text-text-muted">
          No team members yet. Add one under Users → Team.
        </div>
      ) : (
        <div className="rounded-xl border border-nativz-border bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background/50 text-text-muted sticky top-0">
              <tr>
                <th className="text-left font-medium px-3 py-2 w-40">Month</th>
                <th className="text-left font-medium px-3 py-2 w-24">Half</th>
                {columns.map((col) => (
                  <th key={col.key} className="text-right font-medium px-3 py-2 whitespace-nowrap">
                    {col.label}
                    {col.kind === 'other' && (
                      <span className="ml-1 text-[9px] uppercase tracking-wide text-text-muted">
                        ext
                      </span>
                    )}
                  </th>
                ))}
                <th className="text-right font-medium px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.month}:${row.half}`}
                  className={`border-t border-nativz-border ${
                    row.total === 0 ? 'opacity-60' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-text-secondary">
                    {MONTHS[row.month]}
                  </td>
                  <td className="px-3 py-2 text-text-muted text-xs">
                    {row.half === 'first-half' ? '1–15' : '16–EOM'}
                    {row.periodId ? (
                      <Link
                        href={`/admin/tools/accounting/${row.periodId}`}
                        className="ml-2 text-accent-text hover:underline"
                      >
                        open
                      </Link>
                    ) : null}
                  </td>
                  {columns.map((col) => {
                    const v = row.values[col.key] ?? 0;
                    const content = v > 0 ? centsToDollars(v) : '—';
                    const muted = v === 0;
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-2 text-right tabular-nums ${
                          muted ? 'text-text-muted' : 'text-text-primary'
                        }`}
                      >
                        {row.periodId && v > 0 ? (
                          <Link
                            href={`/admin/tools/accounting/${row.periodId}`}
                            className="hover:text-accent-text"
                          >
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary font-medium">
                    {row.total > 0 ? centsToDollars(row.total) : '—'}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-nativz-border bg-background/30">
                <td className="px-3 py-2 font-semibold text-text-primary" colSpan={2}>
                  {year} total
                </td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-3 py-2 text-right tabular-nums font-semibold text-text-primary"
                  >
                    {columnTotals[col.key] > 0
                      ? centsToDollars(columnTotals[col.key])
                      : '—'}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-text-primary">
                  {centsToDollars(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
