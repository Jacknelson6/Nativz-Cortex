'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';

interface ScheduledRow {
  id: string;
  recipient_id: string;
  subject: string;
  send_at: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  failure_reason: string | null;
  recipient: { id: string; email: string | null; full_name: string | null } | null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_STYLES: Record<ScheduledRow['status'], string> = {
  pending: 'text-amber-400',
  sent: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-text-muted',
};

export function ScheduledEmailsTab() {
  const [rows, setRows] = useState<ScheduledRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await fetch('/api/admin/scheduled-emails');
    if (!r.ok) {
      setLoading(false);
      return;
    }
    const d = (await r.json()) as { scheduled: ScheduledRow[] };
    setRows(d.scheduled ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      void load();
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  async function cancel(id: string) {
    if (!confirm('Cancel this scheduled send?')) return;
    const r = await fetch(`/api/admin/scheduled-emails/${id}`, { method: 'DELETE' });
    if (r.ok) {
      toast.success('Cancelled');
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'cancelled' } : x)));
    } else {
      toast.error('Cancel failed');
    }
  }

  if (loading) return <p className="p-4 text-sm text-text-muted">Loading scheduled emails…</p>;
  if (rows.length === 0) return <p className="p-4 text-sm text-text-muted">No scheduled emails.</p>;

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border bg-surface/40">
            <th className="px-4 py-2.5 text-left font-medium text-text-muted">Recipient</th>
            <th className="px-4 py-2.5 text-left font-medium text-text-muted">Subject</th>
            <th className="px-4 py-2.5 text-left font-medium text-text-muted">Send at</th>
            <th className="px-4 py-2.5 text-left font-medium text-text-muted">Status</th>
            <th className="px-4 py-2.5 text-right font-medium text-text-muted">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-nativz-border/60 last:border-b-0">
              <td className="px-4 py-2.5 text-text-primary">
                {r.recipient?.full_name ?? r.recipient?.email ?? '—'}
                {r.recipient?.email && r.recipient.full_name && (
                  <span className="ml-1.5 text-text-muted">({r.recipient.email})</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-text-secondary">{r.subject}</td>
              <td className="px-4 py-2.5 text-text-secondary">{formatDateTime(r.send_at)}</td>
              <td className={cn('px-4 py-2.5 capitalize', STATUS_STYLES[r.status])}>{r.status}</td>
              <td className="px-4 py-2.5 text-right">
                {r.status === 'pending' ? (
                  <button
                    type="button"
                    onClick={() => cancel(r.id)}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-surface-hover hover:text-red-400"
                  >
                    <X size={12} /> Cancel
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
