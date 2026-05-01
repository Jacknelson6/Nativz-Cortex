'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { centsToDollars } from '@/lib/accounting/periods';
import type { GridEntry } from './entries-grid';

interface PayoutRow {
  id: string | null;
  team_member_id: string | null;
  payee_label: string | null;
  display_name: string;
  total_cents: number;
  margin_cents: number;
  entry_types: string[];
  entry_count: number;
  wise_url: string | null;
  status: 'pending' | 'link_received' | 'paid';
  notes: string | null;
  paid_at: string | null;
}

interface Client {
  id: string;
  name: string;
}

interface PayoutsPaneProps {
  periodId: string;
  periodLabel: string;
  entries: GridEntry[];
  clients: Client[];
}

const STATUS_LABELS: Record<PayoutRow['status'], string> = {
  pending: 'Pending',
  link_received: 'Link received',
  paid: 'Paid',
};

const STATUS_TONE: Record<PayoutRow['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  link_received: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const TYPE_BADGE: Record<string, string> = {
  editing: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  smm: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  affiliate: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  blogging: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  override: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  misc: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

export function PayoutsPane({ periodId, periodLabel, entries, clients }: PayoutsPaneProps) {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounting/periods/${periodId}/payouts`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load payouts');
      setRows(data.payouts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payouts');
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalOwed = useMemo(() => rows.reduce((s, r) => s + r.total_cents, 0), [rows]);
  const totalMargin = useMemo(() => rows.reduce((s, r) => s + r.margin_cents, 0), [rows]);
  const counts = useMemo(() => {
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      link: rows.filter((r) => r.status === 'link_received').length,
      paid: rows.filter((r) => r.status === 'paid').length,
    };
  }, [rows]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function patchPayout(
    row: PayoutRow,
    update: { wise_url?: string | null; status?: PayoutRow['status']; notes?: string | null },
  ) {
    if (!row.id) return;
    setSavingId(row.id);
    try {
      const res = await fetch(`/api/accounting/payouts/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, ...mapDbRow(data.payout) } : r)),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  }

  async function copySummary() {
    const lines = rows
      .filter((r) => r.total_cents > 0)
      .map((r) => {
        const total = centsToDollars(r.total_cents);
        const link = r.wise_url ? r.wise_url : '(no link yet)';
        return `${r.display_name} — ${total} — ${link}`;
      });
    if (lines.length === 0) {
      toast.error('Nothing to copy');
      return;
    }
    const header = `${periodLabel} payouts`;
    const text = [header, '', ...lines].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Summary copied');
    } catch {
      toast.error('Copy failed');
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-nativz-border bg-surface px-4 py-12 text-center text-sm text-text-secondary">
        <Loader2 size={16} className="inline animate-spin mr-2" />
        Loading payouts…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-6 text-sm text-red-300">
        {error}
        <Button variant="outline" size="sm" className="ml-3" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-nativz-border bg-surface px-4 py-12 text-center text-sm text-text-secondary">
        No payees yet. Add entries on the service tabs above and they will roll up here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-nativz-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted font-semibold">Total owed</p>
            <p className="text-2xl font-bold text-text-primary tabular-nums">{centsToDollars(totalOwed)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted font-semibold">Margin</p>
            <p className={`text-2xl font-bold tabular-nums ${totalMargin < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {centsToDollars(totalMargin)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {counts.pending > 0 && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE.pending}`}>
                {counts.pending} pending
              </span>
            )}
            {counts.link > 0 && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE.link_received}`}>
                {counts.link} link received
              </span>
            )}
            {counts.paid > 0 && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE.paid}`}>
                <Check size={12} /> {counts.paid} paid
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void copySummary()}>
          <Copy size={14} /> Copy summary
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-nativz-border bg-surface">
        <div className="min-w-[920px]">
        <div className="grid grid-cols-[24px_minmax(160px,1.3fr)_minmax(120px,0.9fr)_minmax(90px,0.7fr)_minmax(90px,0.7fr)_minmax(180px,1.4fr)_minmax(140px,0.8fr)] items-center gap-3 border-b border-nativz-border bg-background/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          <span />
          <span>Payee</span>
          <span>Services</span>
          <span className="text-right">Total</span>
          <span className="text-right">Margin</span>
          <span>Wise invoice URL</span>
          <span>Status</span>
        </div>

        <ul>
          {rows.map((row) => {
            const key = row.id ?? `${row.team_member_id ?? 'l'}:${row.payee_label ?? ''}`;
            const isOpen = expanded.has(key);
            const payeeEntries = entries.filter((e) =>
              row.team_member_id
                ? e.team_member_id === row.team_member_id
                : !e.team_member_id &&
                  (e.payee_label ?? '').trim().toLowerCase() ===
                    (row.payee_label ?? '').trim().toLowerCase(),
            );
            const isSaving = savingId === row.id;
            return (
              <li key={key} className="border-b border-nativz-border last:border-b-0">
                <div className="grid grid-cols-[24px_minmax(160px,1.3fr)_minmax(120px,0.9fr)_minmax(90px,0.7fr)_minmax(90px,0.7fr)_minmax(180px,1.4fr)_minmax(140px,0.8fr)] items-center gap-3 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleExpand(key)}
                    className="text-text-muted hover:text-text-primary"
                    aria-label={isOpen ? 'Collapse entries' : 'Expand entries'}
                  >
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleExpand(key)}
                    className="truncate text-left text-sm font-medium text-text-primary hover:text-accent"
                  >
                    {row.display_name}
                    <span className="ml-2 text-xs font-normal text-text-muted">
                      {row.entry_count} {row.entry_count === 1 ? 'entry' : 'entries'}
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-1">
                    {row.entry_types.map((t) => (
                      <span
                        key={t}
                        className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${TYPE_BADGE[t] ?? TYPE_BADGE.misc}`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <span className="text-right text-sm font-semibold tabular-nums text-text-primary">
                    {centsToDollars(row.total_cents)}
                  </span>
                  <span
                    className={`text-right text-sm tabular-nums ${
                      row.margin_cents === 0
                        ? 'text-text-muted'
                        : row.margin_cents < 0
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {row.margin_cents === 0 ? '—' : centsToDollars(row.margin_cents)}
                  </span>
                  <WiseUrlField row={row} onSave={(url) => patchPayout(row, { wise_url: url })} />
                  <div className="flex items-center gap-2">
                    <select
                      value={row.status}
                      onChange={(e) =>
                        patchPayout(row, { status: e.target.value as PayoutRow['status'] })
                      }
                      className={`w-full rounded-md border bg-background px-2 py-1 text-xs font-medium focus:border-accent focus:outline-none ${STATUS_TONE[row.status]}`}
                    >
                      {(['pending', 'link_received', 'paid'] as const).map((s) => (
                        <option key={s} value={s} className="bg-background text-text-primary">
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    {isSaving && <Loader2 size={12} className="animate-spin text-text-muted" />}
                  </div>
                </div>
                {isOpen && (
                  <PayoutEntriesBreakdown entries={payeeEntries} clientById={clientById} />
                )}
              </li>
            );
          })}
        </ul>
        </div>
      </div>
    </div>
  );
}

function WiseUrlField({
  row,
  onSave,
}: {
  row: PayoutRow;
  onSave: (url: string | null) => Promise<void> | void;
}) {
  const [value, setValue] = useState(row.wise_url ?? '');
  const [seen, setSeen] = useState(row.wise_url ?? '');

  if ((row.wise_url ?? '') !== seen) {
    setSeen(row.wise_url ?? '');
    setValue(row.wise_url ?? '');
  }

  async function commit() {
    const trimmed = value.trim();
    if (trimmed === (row.wise_url ?? '')) return;
    await onSave(trimmed.length > 0 ? trimmed : null);
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        placeholder="https://wise.com/pay/..."
        className="min-w-0 flex-1 rounded-md border border-nativz-border bg-background px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
      />
      {row.wise_url && (
        <a
          href={row.wise_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-muted hover:text-accent"
          title="Open Wise link"
        >
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

function PayoutEntriesBreakdown({
  entries,
  clientById,
}: {
  entries: GridEntry[];
  clientById: Map<string, Client>;
}) {
  if (entries.length === 0) {
    return (
      <div className="border-t border-nativz-border bg-background/40 px-4 py-4 text-xs text-text-muted">
        No entries.
      </div>
    );
  }
  return (
    <div className="border-t border-nativz-border bg-background/40 px-4 py-3">
      <table className="w-full text-xs">
        <thead className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          <tr>
            <th className="py-1.5 pr-3 text-left">Type</th>
            <th className="py-1.5 pr-3 text-left">Client</th>
            <th className="py-1.5 pr-3 text-right">Videos</th>
            <th className="py-1.5 pr-3 text-right">Rate</th>
            <th className="py-1.5 pr-3 text-right">Amount</th>
            <th className="py-1.5 pr-3 text-right">Margin</th>
            <th className="py-1.5 text-left">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-nativz-border/60">
          {entries.map((e) => {
            const client = e.client_id ? clientById.get(e.client_id) : null;
            return (
              <tr key={e.id} className="text-text-secondary">
                <td className="py-1.5 pr-3 capitalize">{e.entry_type}</td>
                <td className="py-1.5 pr-3 text-text-primary">{client?.name ?? '—'}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{e.video_count || '—'}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {e.rate_cents ? centsToDollars(e.rate_cents) : '—'}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-text-primary">
                  {centsToDollars(e.amount_cents)}
                </td>
                <td
                  className={`py-1.5 pr-3 text-right tabular-nums ${
                    e.margin_cents === 0
                      ? 'text-text-muted'
                      : e.margin_cents < 0
                      ? 'text-red-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {e.margin_cents === 0 ? '—' : centsToDollars(e.margin_cents)}
                </td>
                <td className="py-1.5 text-text-muted">{e.description ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function mapDbRow(p: {
  id: string;
  team_member_id: string | null;
  payee_label: string | null;
  wise_url: string | null;
  status: PayoutRow['status'];
  notes: string | null;
  paid_at: string | null;
}): Partial<PayoutRow> {
  return {
    id: p.id,
    team_member_id: p.team_member_id,
    payee_label: p.payee_label,
    wise_url: p.wise_url,
    status: p.status,
    notes: p.notes,
    paid_at: p.paid_at,
  };
}
