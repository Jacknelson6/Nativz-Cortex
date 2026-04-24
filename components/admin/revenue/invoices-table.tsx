'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, RefreshCcw, Send, Undo2 } from 'lucide-react';
import { formatCents, dollarsToCents, centsToDollars } from '@/lib/format/money';
import { InvoiceStatusPill } from './status-pill';

type Invoice = {
  id: string;
  number: string | null;
  status: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  amount_remaining_cents: number;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  client_id: string | null;
  created_at: string | null;
  clients: { name: string | null; slug: string | null } | null;
};

export function InvoicesTable() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/revenue/invoices?limit=200${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`,
    );
    const json = await res.json();
    setInvoices(json.invoices ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function sendReminder(inv: Invoice) {
    if (!confirm(`Send payment reminder for invoice ${inv.number ?? inv.id}?`)) return;
    setBusyRow(inv.id);
    const res = await fetch(`/api/revenue/invoices/${inv.id}/remind`, { method: 'POST' });
    setBusyRow(null);
    if (!res.ok) {
      const text = await res.text();
      alert(`Reminder failed: ${text}`);
      return;
    }
    alert('Reminder sent.');
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Filter</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-nativz-border bg-surface px-2 py-1 text-xs text-text-primary"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="paid">Paid</option>
            <option value="draft">Draft</option>
            <option value="uncollectible">Uncollectible</option>
            <option value="void">Void</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1 text-xs text-text-primary hover:bg-white/5"
        >
          <RefreshCcw size={12} /> Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium">Number</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Amount</th>
              <th className="px-4 py-2.5 font-medium text-right">Paid</th>
              <th className="px-4 py-2.5 font-medium">Due</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-xs text-text-muted">
                  Loading…
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-xs text-text-muted">
                  No invoices.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-text-primary">
                    {inv.clients?.slug ? (
                      <Link
                        href={`/admin/clients/${inv.clients.slug}/billing`}
                        className="hover:text-nz-cyan"
                      >
                        {inv.clients.name ?? '—'}
                      </Link>
                    ) : (
                      <span className="text-text-muted">Unlinked</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-text-secondary">
                    {inv.number ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <InvoiceStatusPill status={inv.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                    {formatCents(inv.amount_due_cents, inv.currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                    {formatCents(inv.amount_paid_cents, inv.currency)}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-US') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2 text-[11px]">
                      {inv.status === 'open' && inv.clients?.slug ? (
                        <button
                          type="button"
                          onClick={() => sendReminder(inv)}
                          disabled={busyRow === inv.id}
                          className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2 py-0.5 text-text-primary hover:bg-white/5 disabled:opacity-50"
                          title="Send payment reminder email"
                        >
                          <Send size={11} /> Remind
                        </button>
                      ) : null}
                      {inv.status === 'paid' ? (
                        <button
                          type="button"
                          onClick={() => setRefunding(inv)}
                          className="inline-flex items-center gap-1 rounded-full border border-coral-300/40 bg-coral-500/10 px-2 py-0.5 text-coral-300 hover:bg-coral-500/20"
                          title="Refund via Stripe"
                        >
                          <Undo2 size={11} /> Refund
                        </button>
                      ) : null}
                      {inv.hosted_invoice_url ? (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-nz-cyan hover:text-nz-cyan/80"
                        >
                          <ExternalLink size={11} /> Stripe
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {refunding ? (
        <RefundDialog
          invoice={refunding}
          onClose={() => setRefunding(null)}
          onDone={() => {
            setRefunding(null);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function RefundDialog({
  invoice,
  onClose,
  onDone,
}: {
  invoice: Invoice;
  onClose: () => void;
  onDone: () => void;
}) {
  const maxDollars = centsToDollars(invoice.amount_paid_cents);
  const [amount, setAmount] = useState(String(maxDollars.toFixed(2)));
  const [reason, setReason] = useState<'requested_by_customer' | 'duplicate' | 'fraudulent'>(
    'requested_by_customer',
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const cents = dollarsToCents(amount);
    if (cents <= 0 || cents > invoice.amount_paid_cents) {
      alert('Amount must be > 0 and <= paid amount');
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/revenue/invoices/${invoice.id}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount_dollars: Number(amount), reason, note }),
    });
    setBusy(false);
    if (!res.ok) {
      const text = await res.text();
      alert(`Refund failed: ${text}`);
      return;
    }
    onDone();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-nativz-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-text-primary">
          Refund invoice {invoice.number ?? ''}
        </h3>
        <p className="mt-1 text-[11px] text-text-muted">
          {invoice.clients?.name} — paid {formatCents(invoice.amount_paid_cents, invoice.currency)}
        </p>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
              Amount ($)
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              max={maxDollars}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="requested_by_customer">Requested by customer</option>
              <option value="duplicate">Duplicate</option>
              <option value="fraudulent">Fraudulent</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Note (internal)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-nativz-border bg-surface px-3 py-1 text-xs text-text-primary hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-coral-500/20 px-3 py-1 text-xs font-medium text-coral-300 hover:bg-coral-500/30 disabled:opacity-50"
          >
            {busy ? 'Refunding…' : 'Refund in Stripe'}
          </button>
        </div>
      </div>
    </div>
  );
}
