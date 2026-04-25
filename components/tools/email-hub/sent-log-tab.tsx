'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  Eye,
  MailX,
  RefreshCcw,
  MousePointerClick,
  AlertCircle,
} from 'lucide-react';
import { TONE_PILL, TONE_TEXT, deliveryStatusTone } from './_status-tokens';

type Row = {
  id: string;
  source: 'campaign' | 'onboarding';
  recipient: string;
  subject: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  failure_reason: string | null;
  open_count: number;
  click_count: number;
  resend_id: string | null;
  type_hint: string | null;
  agency: string | null;
  sender_user_email: string | null;
  client_name: string | null;
  client_slug: string | null;
};

type Counts = {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  bounced: number;
  failed: number;
};

export function SentLogTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'all' | 'campaign' | 'onboarding'>('all');
  const [status, setStatus] = useState<string>('all');
  const [sinceHours, setSinceHours] = useState<number>(24 * 7);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (source !== 'all') params.set('source', source);
    if (status !== 'all') params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    if (sinceHours > 0) {
      params.set('since', new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString());
    }
    params.set('limit', '300');
    try {
      const res = await fetch(`/api/admin/email-log?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Status ${res.status}`);
      }
      const json = await res.json();
      setRows(json.rows ?? []);
      setCounts(json.counts ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sent log');
      setRows([]);
      setCounts(null);
    } finally {
      setLoading(false);
    }
  }, [source, status, sinceHours, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        Every outbound email from Cortex — campaigns, one-off composer sends, invites, onboarding
        messages, payment reminders, report digests. Delivery + open + click events come from the
        Resend webhook; onboarding sends log at send-time whether or not the webhook arrives.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search recipient or subject…"
          aria-label="Search sent log"
          className="flex-1 min-w-[200px] rounded-full border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          aria-label="Source filter"
          className="rounded-full border border-nativz-border bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="all">All sources</option>
          <option value="campaign">Campaigns + composer</option>
          <option value="onboarding">Onboarding + reminders</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status filter"
          className="rounded-full border border-nativz-border bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="all">All statuses</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="bounced">Bounced</option>
          <option value="failed">Failed</option>
          <option value="complained">Complained</option>
        </select>
        <select
          value={sinceHours}
          onChange={(e) => setSinceHours(Number(e.target.value))}
          aria-label="Time window"
          className="rounded-full border border-nativz-border bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value={24}>Last 24h</option>
          <option value={24 * 7}>Last 7d</option>
          <option value={24 * 30}>Last 30d</option>
          <option value={24 * 90}>Last 90d</option>
          <option value={0}>All time</option>
        </select>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface px-3 py-2 text-xs text-text-primary hover:bg-surface-hover/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <RefreshCcw size={12} aria-hidden /> Refresh
        </button>
      </div>

      {counts ? (
        <div className="flex flex-wrap gap-4 text-[11px] text-text-muted">
          <span>
            <strong className="text-text-primary">{counts.total}</strong> total
          </span>
          <span>
            <CheckCircle2 className={`inline ${TONE_TEXT.success}`} size={11} aria-hidden /> {counts.delivered} delivered
          </span>
          <span>
            <Eye className={`inline ${TONE_TEXT.info}`} size={11} aria-hidden /> {counts.opened} opened
          </span>
          <span>
            <MailX className={`inline ${TONE_TEXT.warning}`} size={11} aria-hidden /> {counts.bounced} bounced
          </span>
          <span>
            <AlertCircle className={`inline ${TONE_TEXT.danger}`} size={11} aria-hidden /> {counts.failed} failed
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-6 py-8 text-center">
          <p className="text-sm text-rose-500">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-full border border-nativz-border bg-background px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            Retry
          </button>
        </div>
      ) : (
        <SentRowsView rows={rows} loading={loading} />
      )}
    </div>
  );
}

/**
 * Two layouts behind one breakpoint: card list on mobile (avoids the WCAG-
 * blocking horizontal scroll on a 7-col table), classic table from `md` up
 * where horizontal real estate exists.
 */
function SentRowsView({ rows, loading }: { rows: Row[]; loading: boolean }) {
  if (loading && rows.length === 0) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface px-4 py-8 text-center text-xs text-text-muted">
        Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface px-4 py-8 text-center text-xs text-text-muted">
        No sent emails in this window.
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li
            key={`m-${r.source}-${r.id}`}
            className="rounded-xl border border-nativz-border bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                {r.subject}
              </p>
              <StatusBadge row={r} />
            </div>
            <p className="mt-1 truncate text-xs text-text-secondary">{r.recipient}</p>
            {r.client_slug ? (
              <Link
                href={`/admin/clients/${r.client_slug}/billing`}
                className="mt-0.5 inline-block text-[10px] text-text-muted hover:text-text-primary"
              >
                {r.client_name}
              </Link>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
              <span className="capitalize">{r.type_hint ?? r.source}</span>
              <span>
                {r.sent_at
                  ? new Date(r.sent_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
                  : '—'}
              </span>
              {r.open_count > 0 ? (
                <span className={`inline-flex items-center gap-1 ${TONE_TEXT.info}`}>
                  <Eye size={11} aria-hidden /> {r.open_count}
                </span>
              ) : null}
              {r.click_count > 0 ? (
                <span className={`inline-flex items-center gap-1 ${TONE_TEXT.info}`}>
                  <MousePointerClick size={11} aria-hidden /> {r.click_count}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block overflow-hidden rounded-xl border border-nativz-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-hover/40 text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Sent</th>
              <th className="px-4 py-2.5 font-medium">Recipient</th>
              <th className="px-4 py-2.5 font-medium">Subject</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Opens</th>
              <th className="px-4 py-2.5 font-medium text-right">Clicks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nativz-border">
            {rows.map((r) => (
              <tr key={`${r.source}-${r.id}`} className="hover:bg-surface-hover/40">
                <td className="px-4 py-2.5 text-[11px] text-text-muted whitespace-nowrap">
                  {r.sent_at
                    ? new Date(r.sent_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
                    : '—'}
                </td>
                <td className="px-4 py-2.5 text-text-primary">
                  <div className="flex flex-col">
                    <span>{r.recipient}</span>
                    {r.client_slug ? (
                      <Link
                        href={`/admin/clients/${r.client_slug}/billing`}
                        className="text-[10px] text-text-muted hover:text-text-primary"
                      >
                        {r.client_name}
                      </Link>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-text-secondary">{r.subject}</td>
                <td className="px-4 py-2.5 text-[11px] capitalize text-text-muted">
                  {r.type_hint ?? r.source}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge row={r} />
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                  {r.open_count > 0 ? (
                    <span className={`inline-flex items-center gap-1 ${TONE_TEXT.info}`}>
                      <Eye size={11} aria-hidden /> {r.open_count}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                  {r.click_count > 0 ? (
                    <span className={`inline-flex items-center gap-1 ${TONE_TEXT.info}`}>
                      <MousePointerClick size={11} aria-hidden /> {r.click_count}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatusBadge({ row }: { row: Row }) {
  const tone = deliveryStatusTone(row.status);
  const labelMap: Record<string, string> = {
    bounced: 'Bounced',
    complained: 'Complained',
    failed: 'Failed',
    delivered: 'Delivered',
    sent: 'Sent',
  };
  const label = labelMap[row.status] ?? row.status;
  const Icon = (() => {
    if (row.status === 'bounced' || row.status === 'complained') return MailX;
    if (row.status === 'failed') return AlertCircle;
    if (row.status === 'delivered' || row.status === 'sent') return CheckCircle2;
    return Circle;
  })();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${TONE_PILL[tone]}`}
      title={row.failure_reason ?? ''}
    >
      <Icon size={11} aria-hidden /> {label}
    </span>
  );
}
