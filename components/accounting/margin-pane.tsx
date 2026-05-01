'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { centsToDollars } from '@/lib/accounting/periods';
import type { GridEntry } from './entries-grid';

interface Client {
  id: string;
  name: string;
  editing_rate_per_video_cents?: number | null;
}

interface TeamMember { id: string; full_name: string | null }

interface MarginPaneProps {
  periodLabel: string;
  entries: GridEntry[];
  clients: Client[];
  teamMembers: TeamMember[];
}

interface ClientRow {
  client_id: string | null;
  client_name: string;
  client_rate_cents: number | null;
  videos: number;
  payout_cents: number;
  revenue_cents: number;
  margin_cents: number;
  entry_count: number;
}

interface EditorRow {
  key: string;
  team_member_id: string | null;
  display_name: string;
  videos: number;
  payout_cents: number;
  revenue_cents: number;
  margin_cents: number;
  entry_count: number;
  per_client: ClientRow[];
}

export function MarginPane({ periodLabel, entries, clients, teamMembers }: MarginPaneProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const memberById = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers]);

  // Pull editing entries only — that's the slice with a true revenue side.
  const editorRows = useMemo<EditorRow[]>(() => {
    const editorMap = new Map<string, EditorRow>();

    for (const e of entries) {
      if (e.entry_type !== 'editing') continue;

      const key = e.team_member_id
        ? `m:${e.team_member_id}`
        : `l:${(e.payee_label ?? '').trim().toLowerCase() || '__unknown__'}`;
      const display = e.team_member_id
        ? (memberById.get(e.team_member_id)?.full_name ?? e.payee_label ?? 'Unknown')
        : (e.payee_label ?? 'Unknown');

      const client = e.client_id ? clientById.get(e.client_id) : null;
      const clientRate = client?.editing_rate_per_video_cents ?? null;
      const videos = e.video_count ?? 0;
      const revenue = clientRate != null && videos > 0 ? clientRate * videos : (e.amount_cents ?? 0) + (e.margin_cents ?? 0);

      let editor = editorMap.get(key);
      if (!editor) {
        editor = {
          key,
          team_member_id: e.team_member_id,
          display_name: display,
          videos: 0,
          payout_cents: 0,
          revenue_cents: 0,
          margin_cents: 0,
          entry_count: 0,
          per_client: [],
        };
        editorMap.set(key, editor);
      }

      const clientKey = e.client_id ?? '__none__';
      let cr = editor.per_client.find((r) => (r.client_id ?? '__none__') === clientKey);
      if (!cr) {
        cr = {
          client_id: e.client_id,
          client_name: client?.name ?? (e.client_id ? 'Unknown client' : 'No client'),
          client_rate_cents: clientRate,
          videos: 0,
          payout_cents: 0,
          revenue_cents: 0,
          margin_cents: 0,
          entry_count: 0,
        };
        editor.per_client.push(cr);
      }

      cr.videos += videos;
      cr.payout_cents += e.amount_cents ?? 0;
      cr.revenue_cents += revenue;
      cr.margin_cents += e.margin_cents ?? 0;
      cr.entry_count += 1;

      editor.videos += videos;
      editor.payout_cents += e.amount_cents ?? 0;
      editor.revenue_cents += revenue;
      editor.margin_cents += e.margin_cents ?? 0;
      editor.entry_count += 1;
    }

    const rows = Array.from(editorMap.values());
    for (const r of rows) {
      r.per_client.sort((a, b) => b.revenue_cents - a.revenue_cents);
    }
    rows.sort((a, b) => b.margin_cents - a.margin_cents);
    return rows;
  }, [entries, clientById, memberById]);

  const totals = useMemo(() => {
    return {
      revenue: editorRows.reduce((s, r) => s + r.revenue_cents, 0),
      payout: editorRows.reduce((s, r) => s + r.payout_cents, 0),
      margin: editorRows.reduce((s, r) => s + r.margin_cents, 0),
      videos: editorRows.reduce((s, r) => s + r.videos, 0),
    };
  }, [editorRows]);

  function toggle(k: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  if (editorRows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-nativz-border bg-surface px-4 py-12 text-center text-sm text-text-secondary">
        No editing entries this period. Add some on the Editing tab and the margin breakdown will appear here.
      </div>
    );
  }

  const marginPct = totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Revenue" value={centsToDollars(totals.revenue)} sub={`${periodLabel}`} />
        <Stat label="Editor payouts" value={centsToDollars(totals.payout)} sub={`${totals.videos} videos`} tone="muted" />
        <Stat
          label="Your margin"
          value={centsToDollars(totals.margin)}
          tone={totals.margin < 0 ? 'negative' : 'positive'}
          sub={totals.revenue > 0 ? `${marginPct.toFixed(1)}% of revenue` : undefined}
        />
        <Stat
          label="Editors"
          value={editorRows.length.toLocaleString()}
          sub={`${editorRows.reduce((s, r) => s + r.entry_count, 0)} entries`}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-nativz-border bg-surface">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[24px_minmax(180px,1.4fr)_minmax(80px,0.5fr)_minmax(100px,0.7fr)_minmax(100px,0.7fr)_minmax(100px,0.7fr)_minmax(80px,0.5fr)] items-center gap-3 border-b border-nativz-border bg-background/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            <span />
            <span>Editor</span>
            <span className="text-right">Videos</span>
            <span className="text-right">Revenue</span>
            <span className="text-right">Payout</span>
            <span className="text-right">Margin</span>
            <span className="text-right">%</span>
          </div>

          <ul>
            {editorRows.map((editor) => {
              const isOpen = expanded.has(editor.key);
              const pct = editor.revenue_cents > 0 ? (editor.margin_cents / editor.revenue_cents) * 100 : 0;
              return (
                <li key={editor.key} className="border-b border-nativz-border last:border-b-0">
                  <div className="grid grid-cols-[24px_minmax(180px,1.4fr)_minmax(80px,0.5fr)_minmax(100px,0.7fr)_minmax(100px,0.7fr)_minmax(100px,0.7fr)_minmax(80px,0.5fr)] items-center gap-3 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggle(editor.key)}
                      className="text-text-muted hover:text-text-primary"
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggle(editor.key)}
                        className="truncate text-left text-sm font-medium text-text-primary hover:text-accent"
                      >
                        {editor.display_name}
                        <span className="ml-2 text-xs font-normal text-text-muted">
                          {editor.entry_count} {editor.entry_count === 1 ? 'entry' : 'entries'}
                        </span>
                      </button>
                      {editor.team_member_id && (
                        <Link
                          href={`/admin/accounting/editor/${editor.team_member_id}`}
                          className="shrink-0 text-text-muted hover:text-accent-text"
                          title="Open editor's cross-period view"
                        >
                          <ArrowUpRight size={14} />
                        </Link>
                      )}
                    </div>
                    <span className="text-right text-sm tabular-nums text-text-primary">{editor.videos}</span>
                    <span className="text-right text-sm tabular-nums text-text-primary">
                      {centsToDollars(editor.revenue_cents)}
                    </span>
                    <span className="text-right text-sm tabular-nums text-text-secondary">
                      {centsToDollars(editor.payout_cents)}
                    </span>
                    <span
                      className={`text-right text-sm font-semibold tabular-nums ${
                        editor.margin_cents === 0
                          ? 'text-text-muted'
                          : editor.margin_cents < 0
                          ? 'text-red-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {editor.margin_cents === 0 ? '—' : centsToDollars(editor.margin_cents)}
                    </span>
                    <span
                      className={`text-right text-xs tabular-nums ${
                        editor.margin_cents < 0 ? 'text-red-400' : 'text-text-muted'
                      }`}
                    >
                      {editor.revenue_cents > 0 ? `${pct.toFixed(0)}%` : '—'}
                    </span>
                  </div>
                  {isOpen && <PerClientBreakdown clients={editor.per_client} />}
                </li>
              );
            })}
          </ul>

          <div className="grid grid-cols-[24px_minmax(180px,1.4fr)_minmax(80px,0.5fr)_minmax(100px,0.7fr)_minmax(100px,0.7fr)_minmax(100px,0.7fr)_minmax(80px,0.5fr)] items-center gap-3 border-t-2 border-nativz-border bg-background/40 px-4 py-3">
            <span />
            <span className="text-sm font-bold text-text-primary">Period total</span>
            <span className="text-right text-sm font-bold tabular-nums text-text-primary">{totals.videos}</span>
            <span className="text-right text-sm font-bold tabular-nums text-text-primary">
              {centsToDollars(totals.revenue)}
            </span>
            <span className="text-right text-sm font-bold tabular-nums text-text-primary">
              {centsToDollars(totals.payout)}
            </span>
            <span
              className={`text-right text-sm font-bold tabular-nums ${
                totals.margin < 0 ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {centsToDollars(totals.margin)}
            </span>
            <span
              className={`text-right text-xs font-bold tabular-nums ${
                totals.margin < 0 ? 'text-red-400' : 'text-text-secondary'
              }`}
            >
              {totals.revenue > 0 ? `${marginPct.toFixed(1)}%` : '—'}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Revenue per row uses the client&apos;s configured rate (clients.editing_rate_per_video_cents) × videos. When a
        client is missing or has no rate set, revenue falls back to payout + margin so the totals still balance.
      </p>
    </div>
  );
}

function PerClientBreakdown({ clients }: { clients: ClientRow[] }) {
  return (
    <div className="border-t border-nativz-border bg-background/40 px-4 py-3">
      <table className="w-full text-xs">
        <thead className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          <tr>
            <th className="py-1.5 pr-3 text-left">Client</th>
            <th className="py-1.5 pr-3 text-right">Videos</th>
            <th className="py-1.5 pr-3 text-right">Client rate</th>
            <th className="py-1.5 pr-3 text-right">Revenue</th>
            <th className="py-1.5 pr-3 text-right">Payout</th>
            <th className="py-1.5 pr-3 text-right">Margin</th>
            <th className="py-1.5 text-right">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-nativz-border/60">
          {clients.map((c) => {
            const pct = c.revenue_cents > 0 ? (c.margin_cents / c.revenue_cents) * 100 : 0;
            const missingRate = c.client_id && (c.client_rate_cents == null || c.client_rate_cents === 0);
            return (
              <tr key={c.client_id ?? '__none__'} className="text-text-secondary">
                <td className="py-1.5 pr-3 text-text-primary">
                  <div className="flex items-center gap-1.5">
                    <span>{c.client_name}</span>
                    {missingRate && (
                      <span title="No editing rate set on this client" className="text-amber-400">
                        <AlertTriangle size={11} />
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{c.videos || '—'}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {c.client_rate_cents != null ? centsToDollars(c.client_rate_cents) : '—'}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-text-primary">
                  {centsToDollars(c.revenue_cents)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{centsToDollars(c.payout_cents)}</td>
                <td
                  className={`py-1.5 pr-3 text-right tabular-nums ${
                    c.margin_cents === 0
                      ? 'text-text-muted'
                      : c.margin_cents < 0
                      ? 'text-red-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {c.margin_cents === 0 ? '—' : centsToDollars(c.margin_cents)}
                </td>
                <td className={`py-1.5 text-right tabular-nums ${c.margin_cents < 0 ? 'text-red-400' : 'text-text-muted'}`}>
                  {c.revenue_cents > 0 ? `${pct.toFixed(0)}%` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive' | 'negative' | 'muted' | 'neutral';
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-400'
      : tone === 'negative'
      ? 'text-red-400'
      : tone === 'muted'
      ? 'text-text-secondary'
      : 'text-text-primary';
  return (
    <div className="rounded-2xl border border-nativz-border bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}
