'use client';

import { Download, Lock } from 'lucide-react';

interface Entry {
  id: string;
  entry_type: string;
  payee: string | null;
  client_name: string | null;
  amount_cents: number;
  margin_cents: number;
  description: string | null;
}

interface Period {
  id: string;
  label: string;
  status: 'draft' | 'locked' | 'paid';
  start_date: string;
  end_date: string;
  locked_at: string | null;
  paid_at: string | null;
}

interface Props {
  token: string;
  role: 'comptroller' | 'ceo';
  label: string | null;
  period: Period;
  entries: Entry[];
}

const ROLE_LABEL: Record<Props['role'], string> = {
  comptroller: 'Comptroller',
  ceo: 'CEO',
};

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function ComptrollerReadonlyClient({ token, role, label, period, entries }: Props) {
  const totals = entries.reduce(
    (acc, e) => {
      acc.amount += e.amount_cents;
      acc.margin += e.margin_cents;
      acc.byType[e.entry_type] = (acc.byType[e.entry_type] ?? 0) + e.amount_cents;
      return acc;
    },
    { amount: 0, margin: 0, byType: {} as Record<string, number> },
  );

  const typeOrder = ['editing', 'smm', 'affiliate', 'blogging', 'override', 'misc'];
  const typesPresent = typeOrder.filter((t) => totals.byType[t] !== undefined);

  function handleDownloadCsv() {
    const header = ['Type', 'Payee', 'Client', 'Amount', 'Description'];
    const rows = entries.map((e) => [
      e.entry_type,
      e.payee ?? '',
      e.client_name ?? '',
      (e.amount_cents / 100).toFixed(2),
      (e.description ?? '').replace(/\n/g, ' '),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `payroll-${period.start_date}_${period.end_date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <header className="mb-6">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          <Lock size={12} aria-hidden />
          {ROLE_LABEL[role]} view — read-only
          {label ? <span className="text-text-muted/70">· {label}</span> : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
          Payroll · {period.label}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {period.start_date} → {period.end_date} · Status:{' '}
          <span className="font-medium text-text-primary capitalize">{period.status}</span>
          {period.paid_at ? <> · Paid {new Date(period.paid_at).toLocaleDateString()}</> : null}
          {!period.paid_at && period.locked_at ? (
            <> · Locked {new Date(period.locked_at).toLocaleDateString()}</>
          ) : null}
        </p>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard label="Total payouts" value={formatCents(totals.amount)} tone="primary" />
        <SummaryCard label="Margin" value={formatCents(totals.margin)} tone="muted" />
        <SummaryCard label="Entries" value={String(entries.length)} tone="muted" />
      </section>

      {typesPresent.length > 0 && (
        <section className="mb-6 rounded-2xl border border-nativz-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Breakdown by type</h2>
          <div className="space-y-1.5">
            {typesPresent.map((t) => (
              <div key={t} className="flex items-center justify-between text-sm">
                <span className="capitalize text-text-secondary">{t}</span>
                <span className="font-medium text-text-primary">
                  {formatCents(totals.byType[t] ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-nativz-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-nativz-border/60 p-4">
          <h2 className="text-sm font-semibold text-text-primary">Line items</h2>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-background px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent/40 hover:text-text-primary"
          >
            <Download size={13} aria-hidden />
            Download CSV
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="p-6 text-sm text-text-muted">No entries on this period yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-background/40 text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Type</th>
                <th className="px-4 py-2.5 text-left font-semibold">Payee</th>
                <th className="px-4 py-2.5 text-left font-semibold">Client</th>
                <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nativz-border/60">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2.5 capitalize text-text-secondary">{e.entry_type}</td>
                  <td className="px-4 py-2.5 text-text-primary">{e.payee ?? '—'}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{e.client_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-primary">
                    {formatCents(e.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="mt-6 text-center text-[11px] text-text-muted/60">
        This link was generated by Nativz. Read-only · token {token.slice(0, 6)}…
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'primary' | 'muted';
}) {
  return (
    <div className="rounded-2xl border border-nativz-border bg-surface p-5 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          tone === 'primary' ? 'text-text-primary' : 'text-text-secondary'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
