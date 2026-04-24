'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Link2, Send } from 'lucide-react';
import { centsToDollars } from '@/lib/format/money';

type Contract = {
  id: string;
  label: string | null;
  external_provider: string | null;
  external_url: string | null;
  external_id: string | null;
  sent_at: string | null;
  signed_at: string | null;
  total_cents: number | null;
  deposit_cents: number | null;
  deposit_invoice_id: string | null;
};

export function ContractKitCard({
  clientId,
  contracts,
}: {
  clientId: string;
  contracts: Contract[];
}) {
  const router = useRouter();
  const primary = contracts[0];
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    external_provider: primary?.external_provider ?? 'contractkit',
    external_url: primary?.external_url ?? '',
    external_id: primary?.external_id ?? '',
    total_dollars: primary?.total_cents != null ? String(centsToDollars(primary.total_cents)) : '',
    deposit_dollars:
      primary?.deposit_cents != null ? String(centsToDollars(primary.deposit_cents)) : '',
    deposit_invoice_id: primary?.deposit_invoice_id ?? '',
  }));

  if (!primary) {
    return (
      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">ContractKit link</h2>
        <p className="mt-2 text-sm text-text-muted">
          Upload a contract above first. Once it exists, you can attach a ContractKit URL and track
          signing + deposit status here.
        </p>
      </section>
    );
  }

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/clients/${clientId}/contracts/${primary.id}/external`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!res.ok) {
      alert('Save failed');
      console.error(await res.text());
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    await save({
      external_provider: form.external_provider,
      external_url: form.external_url || null,
      external_id: form.external_id || null,
      total_dollars: form.total_dollars ? Number(form.total_dollars) : undefined,
      deposit_dollars: form.deposit_dollars ? Number(form.deposit_dollars) : undefined,
      deposit_invoice_id: form.deposit_invoice_id || null,
    });
  }

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text-primary">Contract lifecycle</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => save({ mark: 'sent' })}
            className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1 text-[11px] text-text-primary hover:bg-white/5 disabled:opacity-50"
          >
            <Send size={12} /> Mark sent
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => save({ mark: 'signed' })}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <CheckCircle2 size={12} /> Mark signed
          </button>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-text-muted">Sent</dt>
          <dd className="mt-0.5 text-text-primary">
            {primary.sent_at
              ? new Date(primary.sent_at).toLocaleDateString('en-US', { dateStyle: 'medium' })
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-text-muted">Signed</dt>
          <dd className="mt-0.5 text-text-primary">
            {primary.signed_at
              ? new Date(primary.signed_at).toLocaleDateString('en-US', { dateStyle: 'medium' })
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-text-muted">Total</dt>
          <dd className="mt-0.5 font-mono text-text-primary">
            {primary.total_cents != null ? `$${centsToDollars(primary.total_cents).toFixed(2)}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-text-muted">Deposit</dt>
          <dd className="mt-0.5 font-mono text-text-primary">
            {primary.deposit_cents != null
              ? `$${centsToDollars(primary.deposit_cents).toFixed(2)}`
              : '—'}
          </dd>
        </div>
      </dl>

      <form onSubmit={saveForm} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-1">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Provider</span>
          <select
            value={form.external_provider ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, external_provider: e.target.value }))}
            className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          >
            <option value="contractkit">ContractKit</option>
            <option value="pandadoc">PandaDoc</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <label className="sm:col-span-1">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Signing URL</span>
          <input
            type="url"
            placeholder="https://docs.nativz.io/proposals/..."
            value={form.external_url}
            onChange={(e) => setForm((f) => ({ ...f, external_url: e.target.value }))}
            className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">External ID</span>
          <input
            type="text"
            placeholder="ContractKit signing id"
            value={form.external_id}
            onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))}
            className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Stripe deposit invoice</span>
          <input
            type="text"
            placeholder="in_xxx"
            value={form.deposit_invoice_id}
            onChange={(e) => setForm((f) => ({ ...f, deposit_invoice_id: e.target.value }))}
            className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary font-mono"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Total ($)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.total_dollars}
            onChange={(e) => setForm((f) => ({ ...f, total_dollars: e.target.value }))}
            className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Deposit ($)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.deposit_dollars}
            onChange={(e) => setForm((f) => ({ ...f, deposit_dollars: e.target.value }))}
            className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <div className="sm:col-span-2 flex justify-between">
          {primary.external_url ? (
            <a
              href={primary.external_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-nz-cyan hover:text-nz-cyan/80"
            >
              <Link2 size={12} /> Open current link
            </a>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-nz-cyan px-4 py-1.5 text-xs font-medium text-background hover:bg-nz-cyan/90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
}
