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
  const [source, setSource] = useState<'all' | 'campaign' | 'onboarding'>('all');
  const [status, setStatus] = useState<string>('all');
  const [sinceHours, setSinceHours] = useState<number>(24 * 7);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (source !== 'all') params.set('source', source);
    if (status !== 'all') params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    if (sinceHours > 0) {
      params.set('since', new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString());
    }
    params.set('limit', '300');
    const res = await fetch(`/api/admin/email-log?${params.toString()}`);
    const json = await res.json();
    setRows(json.rows ?? []);
    setCounts(json.counts ?? null);
    setLoading(false);
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
          className="flex-1 min-w-[200px] rounded border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          className="rounded border border-nativz-border bg-surface px-2 py-1.5 text-xs text-text-primary"
        >
          <option value="all">All sources</option>
          <option value="campaign">Campaigns + composer</option>
          <option value="onboarding">Onboarding + reminders</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-nativz-border bg-surface px-2 py-1.5 text-xs text-text-primary"
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
          className="rounded border border-nativz-border bg-surface px-2 py-1.5 text-xs text-text-primary"
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
          className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1 text-xs text-text-primary hover:bg-white/5"
        >
          <RefreshCcw size={12} /> Refresh
        </button>
      </div>

      {counts ? (
        <div className="flex flex-wrap gap-4 text-[11px] text-text-muted">
          <span>
            <strong className="text-text-primary">{counts.total}</strong> total
          </span>
          <span>
            <CheckCircle2 className="inline text-emerald-300" size={11} /> {counts.delivered}{' '}
            delivered
          </span>
          <span>
            <Eye className="inline text-nz-cyan" size={11} /> {counts.opened} opened
          </span>
          <span>
            <MailX className="inline text-amber-300" size={11} /> {counts.bounced} bounced
          </span>
          <span>
            <AlertCircle className="inline text-coral-300" size={11} /> {counts.failed} failed
          </span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-text-muted">
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
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-xs text-text-muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-xs text-text-muted">
                  No sent emails in this window.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.source}-${r.id}`} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-[11px] text-text-muted">
                    {r.sent_at
                      ? new Date(r.sent_at).toLocaleString('en-US', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
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
                      <span className="inline-flex items-center gap-1 text-nz-cyan">
                        <Eye size={11} /> {r.open_count}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                    {r.click_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-nz-cyan">
                        <MousePointerClick size={11} /> {r.click_count}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: Row }) {
  const [label, icon, classes] = (() => {
    if (row.status === 'bounced' || row.status === 'complained') {
      return ['Bounced', <MailX key="i" size={11} />, 'bg-amber-500/10 text-amber-300'];
    }
    if (row.status === 'failed') {
      return ['Failed', <AlertCircle key="i" size={11} />, 'bg-coral-500/10 text-coral-300'];
    }
    if (row.status === 'delivered') {
      return ['Delivered', <CheckCircle2 key="i" size={11} />, 'bg-emerald-500/10 text-emerald-300'];
    }
    if (row.status === 'sent') {
      return ['Sent', <CheckCircle2 key="i" size={11} />, 'bg-nz-cyan/10 text-nz-cyan'];
    }
    return [row.status, <Circle key="i" size={11} />, 'bg-white/5 text-text-muted'];
  })();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${classes}`}
      title={row.failure_reason ?? ''}
    >
      {icon} {label}
    </span>
  );
}
