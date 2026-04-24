import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCents } from '@/lib/format/money';
import { InvoiceStatusPill } from './status-pill';

export async function RevenueInvoicesTab() {
  const admin = createAdminClient();

  const { data } = await admin
    .from('stripe_invoices')
    .select(
      'id, number, status, amount_due_cents, amount_paid_cents, amount_remaining_cents, currency, due_date, paid_at, hosted_invoice_url, client_id, created_at, clients(name, slug)',
    )
    .order('created_at', { ascending: false })
    .limit(150);

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-6 text-sm text-text-muted">
        No invoices yet. Once the Stripe webhook receives events (or you run{' '}
        <code className="rounded bg-black/30 px-1 py-0.5">npm run revenue:backfill</code>), they
        appear here.
      </div>
    );
  }

  return (
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
            <th className="px-4 py-2.5 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {data.map((inv) => {
            const client = inv.clients as { name?: string | null; slug?: string | null } | null;
            return (
              <tr key={inv.id} className="hover:bg-white/5">
                <td className="px-4 py-2.5 text-text-primary">
                  {client?.slug ? (
                    <Link href={`/admin/clients/${client.slug}/billing`} className="hover:text-nz-cyan">
                      {client.name ?? '—'}
                    </Link>
                  ) : (
                    <span className="text-text-muted">Unlinked</span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-text-secondary">
                  {inv.number ?? <span className="text-text-muted">—</span>}
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
                <td className="px-4 py-2.5 text-right">
                  {inv.hosted_invoice_url ? (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-nz-cyan hover:text-nz-cyan/80"
                    >
                      <ExternalLink size={12} /> Stripe
                    </a>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
