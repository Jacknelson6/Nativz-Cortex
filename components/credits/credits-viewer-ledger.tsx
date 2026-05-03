'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  ClientCreditBalanceRow,
  CreditTransactionKind,
  CreditTransactionRow,
} from '@/lib/credits/types';

/**
 * Read-only credits view rendered for portal viewers on `/credits`.
 *
 * Two responsibilities:
 *   1. Show the recent transaction history in plain English (no charge-unit
 *      UUIDs, no internal flags). Reviewers want "Approved a post" /
 *      "Monthly grant", not `consume` / `drop_video:abc12345`.
 *   2. Provide the "Buy more credits" entry point. Phase 4 ships a stub
 *      that POSTs to `/api/credits/checkout` and surfaces a useful error
 *      until Phase 5 wires Stripe Checkout. Once Stripe lands, the same
 *      endpoint will return a redirect URL.
 *
 * Admin controls (allowance, manual grant, pause) live in
 * `CreditsAdminPanel` and are not rendered here.
 */

interface Props {
  balance: ClientCreditBalanceRow | null;
  transactions: CreditTransactionRow[];
  clientName: string;
}

/**
 * Reviewer-friendly labels. We deliberately strip the internal kind names
 * ("grant_topup" → "Top-up", "consume" → "Approval") so the ledger reads
 * like a billing statement rather than an audit log.
 */
const KIND_LABEL: Record<CreditTransactionKind, string> = {
  grant_monthly: 'Monthly allowance',
  grant_topup: 'Top-up',
  consume: 'Post approved',
  refund: 'Refund',
  adjust: 'Adjustment',
  expire: 'Expired',
};

export function CreditsViewerLedger({ balance, transactions, clientName }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server returns transactions sorted DESC; defensive re-sort handles a
  // stale prop or a partial refetch landing out of order.
  const sortedTx = useMemo(
    () => transactions.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [transactions],
  );

  async function buyCredits() {
    setBusy(true);
    setError(null);
    let redirected = false;
    try {
      const res = await fetch('/api/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: balance?.client_id }),
      });
      const text = await res.text();
      const json = text ? (JSON.parse(text) as { url?: string; error?: string }) : null;
      if (!res.ok || !json?.url) {
        throw new Error(json?.error ?? `Checkout unavailable (${res.status})`);
      }
      redirected = true;
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout');
    } finally {
      // Leave the spinner active when we're about to navigate away — the
      // page is unmounting anyway, and resetting busy would briefly flash
      // the button back to enabled.
      if (!redirected) setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-coral-300/30 bg-coral-300/5 p-3 text-sm text-coral-300">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Top-up CTA. Sits above the ledger so it's the first thing a
          reviewer sees when their balance hits zero. */}
      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Need more credits?</h2>
            <p className="mt-1 max-w-prose text-[12px] text-text-muted">
              Top up {clientName} with extra credits any time. Approvals still work if you go
              over your allowance, your next invoice will reflect the overage.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={buyCredits} disabled={busy || !balance}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
            Buy more credits
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Activity</h2>
        <p className="mt-1 text-[12px] text-text-muted">
          The {sortedTx.length} most recent credit movements on this account.
        </p>
        {sortedTx.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">No activity yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="py-2 font-medium">When</th>
                  <th className="py-2 font-medium">Activity</th>
                  <th className="py-2 font-medium text-right">Δ</th>
                  <th className="py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedTx.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2 font-mono text-[11px] text-text-secondary">
                      {new Date(tx.created_at).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-2 text-text-primary">{KIND_LABEL[tx.kind] ?? tx.kind}</td>
                    <td
                      className={`py-2 text-right font-mono ${
                        tx.delta >= 0 ? 'text-emerald-300' : 'text-coral-300'
                      }`}
                    >
                      {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
                    </td>
                    <td className="py-2 text-[11px] text-text-muted">{tx.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
