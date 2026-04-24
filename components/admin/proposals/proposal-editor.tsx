'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { centsToDollars, dollarsToCents, formatCents } from '@/lib/format/money';

type Proposal = {
  id: string;
  slug: string;
  title: string;
  status: string;
  client_id: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signer_title: string | null;
  body_markdown: string | null;
  scope_statement: string | null;
  terms_markdown: string | null;
  expires_at: string | null;
  total_cents: number | null;
  deposit_cents: number | null;
  currency: string;
  stripe_payment_link_url: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  paid_at: string | null;
};

type Package = {
  id: string;
  proposal_id: string;
  name: string;
  description: string | null;
  tier: string | null;
  monthly_cents: number | null;
  annual_cents: number | null;
  setup_cents: number | null;
  sort_order: number;
};

type Deliverable = {
  id: string;
  package_id: string;
  name: string;
  quantity: string | null;
  sort_order: number;
};

type Event = {
  type: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
  ip: string | null;
};

type ClientOption = { id: string; name: string; slug: string };

const SAVE_DEBOUNCE_MS = 800;

export function ProposalEditor({
  proposal: initial,
  packages: initialPackages,
  deliverables: initialDeliverables,
  clients,
  events,
}: {
  proposal: Proposal;
  packages: Package[];
  deliverables: Deliverable[];
  clients: ClientOption[];
  events: Event[];
}) {
  const router = useRouter();
  const [proposal, setProposal] = useState(initial);
  const [packages, setPackages] = useState(initialPackages);
  const [deliverables, setDeliverables] = useState(initialDeliverables);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [sendingBusy, setSendingBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readOnly = !['draft', 'sent', 'viewed'].includes(proposal.status);
  const publicUrl = useMemo(
    () =>
      typeof window !== 'undefined'
        ? `${window.location.origin}/proposals/${proposal.slug}`
        : `/proposals/${proposal.slug}`,
    [proposal.slug],
  );

  const totals = useMemo(() => {
    let monthly = 0;
    let setup = 0;
    for (const p of packages) {
      monthly += p.monthly_cents ?? 0;
      setup += p.setup_cents ?? 0;
    }
    return { monthly, setup, firstInvoice: setup + monthly };
  }, [packages]);

  const saveProposal = useCallback(
    async (patch: Partial<Proposal> & Record<string, unknown>) => {
      setSaving('saving');
      const body: Record<string, unknown> = { ...patch };
      if ('total_cents' in patch) {
        body.total_dollars = patch.total_cents === null ? null : centsToDollars(patch.total_cents as number);
        delete body.total_cents;
      }
      if ('deposit_cents' in patch) {
        body.deposit_dollars = patch.deposit_cents === null ? null : centsToDollars(patch.deposit_cents as number);
        delete body.deposit_cents;
      }
      const res = await fetch(`/api/admin/proposals/${proposal.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      setSaving(res.ok ? 'saved' : 'idle');
      if (res.ok) setTimeout(() => setSaving('idle'), 1200);
    },
    [proposal.id],
  );

  const autosave = useCallback(
    (patch: Partial<Proposal> & Record<string, unknown>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void saveProposal(patch);
      }, SAVE_DEBOUNCE_MS);
    },
    [saveProposal],
  );

  const updateLocal = (patch: Partial<Proposal>) => {
    setProposal((p) => ({ ...p, ...patch }));
    autosave(patch);
  };

  async function addPackage() {
    const res = await fetch(`/api/admin/proposals/${proposal.id}/packages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New package', monthly_dollars: 0, setup_dollars: 0 }),
    });
    const json = await res.json();
    if (!res.ok) return alert(`Could not add package: ${json.error ?? 'unknown'}`);
    setPackages((ps) => [
      ...ps,
      {
        id: json.id,
        proposal_id: proposal.id,
        name: 'New package',
        description: null,
        tier: null,
        monthly_cents: 0,
        annual_cents: null,
        setup_cents: 0,
        sort_order: ps.length,
      },
    ]);
    router.refresh();
  }

  async function updatePackage(pkgId: string, patch: Partial<Package> & Record<string, unknown>) {
    setPackages((ps) => ps.map((p) => (p.id === pkgId ? { ...p, ...(patch as Partial<Package>) } : p)));
    const body: Record<string, unknown> = { ...patch };
    for (const [k, v] of [
      ['monthly_cents', 'monthly_dollars'],
      ['annual_cents', 'annual_dollars'],
      ['setup_cents', 'setup_dollars'],
    ] as const) {
      if (k in patch) {
        const cents = (patch as Record<string, number | null>)[k];
        body[v] = cents === null || cents === undefined ? null : centsToDollars(cents);
        delete body[k];
      }
    }
    await fetch(`/api/admin/proposals/${proposal.id}/packages/${pkgId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  async function removePackage(pkgId: string) {
    if (!confirm('Remove this package?')) return;
    await fetch(`/api/admin/proposals/${proposal.id}/packages/${pkgId}`, { method: 'DELETE' });
    setPackages((ps) => ps.filter((p) => p.id !== pkgId));
    setDeliverables((ds) => ds.filter((d) => d.package_id !== pkgId));
    router.refresh();
  }

  async function addDeliverable(pkgId: string) {
    const res = await fetch(
      `/api/admin/proposals/${proposal.id}/packages/${pkgId}/deliverables`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New deliverable' }),
      },
    );
    const json = await res.json();
    if (!res.ok) return alert(`Could not add deliverable: ${json.error ?? 'unknown'}`);
    setDeliverables((ds) => [
      ...ds,
      {
        id: json.id,
        package_id: pkgId,
        name: 'New deliverable',
        quantity: null,
        sort_order: ds.filter((d) => d.package_id === pkgId).length,
      },
    ]);
  }

  async function updateDeliverable(pkgId: string, delId: string, patch: Partial<Deliverable>) {
    setDeliverables((ds) => ds.map((d) => (d.id === delId ? { ...d, ...patch } : d)));
    await fetch(
      `/api/admin/proposals/${proposal.id}/packages/${pkgId}/deliverables/${delId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      },
    );
  }

  async function removeDeliverable(pkgId: string, delId: string) {
    await fetch(
      `/api/admin/proposals/${proposal.id}/packages/${pkgId}/deliverables/${delId}`,
      { method: 'DELETE' },
    );
    setDeliverables((ds) => ds.filter((d) => d.id !== delId));
  }

  async function sendProposal() {
    if (!proposal.signer_email) {
      setSendError('Add a signer email before sending.');
      return;
    }
    if (
      !confirm(
        `Send this proposal to ${proposal.signer_email}? This will create a Stripe Payment Link for the deposit + email the signing link.`,
      )
    ) {
      return;
    }
    setSendingBusy(true);
    setSendError(null);
    const res = await fetch(`/api/admin/proposals/${proposal.id}/send`, { method: 'POST' });
    const json = await res.json();
    setSendingBusy(false);
    if (!res.ok) {
      setSendError(json.error ?? 'Send failed');
      return;
    }
    router.refresh();
  }

  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/proposals"
            className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary"
          >
            <ArrowLeft size={12} /> All proposals
          </Link>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
            {proposal.status}
          </span>
          <span className="text-[11px] text-text-muted">
            {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(publicUrl)}
            className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1 text-[11px] text-text-primary hover:bg-white/5"
            title="Copy public link"
          >
            <Copy size={11} /> Copy link
          </button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1 text-[11px] text-text-primary hover:bg-white/5"
          >
            <ExternalLink size={11} /> Preview
          </a>
          {!readOnly ? (
            <button
              type="button"
              onClick={sendProposal}
              disabled={sendingBusy}
              className="inline-flex items-center gap-1 rounded-full bg-nz-cyan px-3 py-1 text-[11px] font-medium text-background hover:bg-nz-cyan/90 disabled:opacity-50"
            >
              <Send size={11} /> {sendingBusy ? 'Sending…' : proposal.sent_at ? 'Resend' : 'Send'}
            </button>
          ) : null}
        </div>
      </header>

      {sendError ? <p className="text-sm text-coral-300">{sendError}</p> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="rounded-xl border border-nativz-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-text-primary">Content</h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Title</span>
                <input
                  type="text"
                  value={proposal.title}
                  readOnly={readOnly}
                  onChange={(e) => updateLocal({ title: e.target.value })}
                  className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Scope statement</span>
                <input
                  type="text"
                  value={proposal.scope_statement ?? ''}
                  readOnly={readOnly}
                  onChange={(e) => updateLocal({ scope_statement: e.target.value })}
                  placeholder="One-line summary shown under the title on the signing page"
                  className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Body (markdown)</span>
                <textarea
                  rows={10}
                  value={proposal.body_markdown ?? ''}
                  readOnly={readOnly}
                  onChange={(e) => updateLocal({ body_markdown: e.target.value })}
                  className="w-full rounded border border-nativz-border bg-background px-3 py-2 font-mono text-xs text-text-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Terms (markdown)</span>
                <textarea
                  rows={6}
                  value={proposal.terms_markdown ?? ''}
                  readOnly={readOnly}
                  onChange={(e) => updateLocal({ terms_markdown: e.target.value })}
                  className="w-full rounded border border-nativz-border bg-background px-3 py-2 font-mono text-xs text-text-primary"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-nativz-border bg-surface p-5">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Packages</h2>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={addPackage}
                  className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1 text-[11px] text-text-primary hover:bg-white/5"
                >
                  <Plus size={11} /> Add package
                </button>
              ) : null}
            </header>
            <div className="mt-4 space-y-4">
              {packages.length === 0 ? (
                <p className="text-sm text-text-muted">No packages yet. Add one to set pricing + deliverables.</p>
              ) : null}
              {packages.map((pkg) => (
                <PackageEditor
                  key={pkg.id}
                  readOnly={readOnly}
                  pkg={pkg}
                  deliverables={deliverables.filter((d) => d.package_id === pkg.id)}
                  onChange={(patch) => updatePackage(pkg.id, patch)}
                  onRemove={() => removePackage(pkg.id)}
                  onAddDeliverable={() => addDeliverable(pkg.id)}
                  onUpdateDeliverable={(delId, patch) => updateDeliverable(pkg.id, delId, patch)}
                  onRemoveDeliverable={(delId) => removeDeliverable(pkg.id, delId)}
                />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-nativz-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">Signer</h2>
            <div className="mt-3 space-y-2">
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Client</span>
                <select
                  value={proposal.client_id ?? ''}
                  disabled={readOnly}
                  onChange={(e) => updateLocal({ client_id: e.target.value || null })}
                  className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
                >
                  <option value="">— Prospect —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Name</span>
                <input
                  type="text"
                  value={proposal.signer_name ?? ''}
                  readOnly={readOnly}
                  onChange={(e) => updateLocal({ signer_name: e.target.value })}
                  className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Email</span>
                <input
                  type="email"
                  value={proposal.signer_email ?? ''}
                  readOnly={readOnly}
                  onChange={(e) => updateLocal({ signer_email: e.target.value })}
                  className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Title</span>
                <input
                  type="text"
                  value={proposal.signer_title ?? ''}
                  readOnly={readOnly}
                  onChange={(e) => updateLocal({ signer_title: e.target.value })}
                  className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-nativz-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">Deposit + totals</h2>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted">
              <dt>Setup total</dt>
              <dd className="text-right font-mono text-text-primary">{formatCents(totals.setup)}</dd>
              <dt>Monthly total</dt>
              <dd className="text-right font-mono text-text-primary">{formatCents(totals.monthly)}</dd>
              <dt>First invoice</dt>
              <dd className="text-right font-mono text-text-primary">{formatCents(totals.firstInvoice)}</dd>
            </dl>
            <label className="mt-3 block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Deposit ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={proposal.deposit_cents != null ? centsToDollars(proposal.deposit_cents) : ''}
                readOnly={readOnly}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : dollarsToCents(e.target.value);
                  updateLocal({ deposit_cents: val });
                }}
                className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
              />
            </label>
            {proposal.stripe_payment_link_url ? (
              <p className="mt-2 break-all text-[11px] text-text-muted">
                Payment link:{' '}
                <a
                  href={proposal.stripe_payment_link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-nz-cyan hover:text-nz-cyan/80"
                >
                  {proposal.stripe_payment_link_url}
                </a>
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-nativz-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">Activity</h2>
            <ul className="mt-3 space-y-1 text-[11px] text-text-muted">
              {proposal.sent_at ? (
                <li>
                  <strong className="text-text-primary">Sent</strong>{' '}
                  {new Date(proposal.sent_at).toLocaleString('en-US')}
                </li>
              ) : null}
              {proposal.viewed_at ? (
                <li>
                  <strong className="text-text-primary">Viewed</strong>{' '}
                  {new Date(proposal.viewed_at).toLocaleString('en-US')}
                </li>
              ) : null}
              {proposal.signed_at ? (
                <li className="flex items-center gap-1">
                  <CheckCircle2 size={11} className="text-emerald-300" />
                  <strong className="text-text-primary">Signed</strong>{' '}
                  {new Date(proposal.signed_at).toLocaleString('en-US')}
                </li>
              ) : null}
              {proposal.paid_at ? (
                <li>
                  <strong className="text-text-primary">Paid</strong>{' '}
                  {new Date(proposal.paid_at).toLocaleString('en-US')}
                </li>
              ) : null}
              {events.length === 0 && !proposal.sent_at ? <li>No activity yet.</li> : null}
              {events
                .filter((e) => e.type === 'viewed')
                .slice(0, 3)
                .map((e, i) => (
                  <li key={i}>
                    Viewed {new Date(e.occurred_at).toLocaleDateString('en-US')} from {e.ip ?? 'unknown IP'}
                  </li>
                ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function PackageEditor({
  readOnly,
  pkg,
  deliverables,
  onChange,
  onRemove,
  onAddDeliverable,
  onUpdateDeliverable,
  onRemoveDeliverable,
}: {
  readOnly: boolean;
  pkg: Package;
  deliverables: Deliverable[];
  onChange: (patch: Partial<Package>) => void;
  onRemove: () => void;
  onAddDeliverable: () => void;
  onUpdateDeliverable: (delId: string, patch: Partial<Deliverable>) => void;
  onRemoveDeliverable: (delId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-background/50 p-4">
      <header className="flex items-center justify-between gap-2">
        <input
          type="text"
          value={pkg.name}
          readOnly={readOnly}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 rounded border border-nativz-border bg-background px-2 py-1 text-sm font-semibold text-text-primary"
        />
        <input
          type="text"
          placeholder="Tier (optional)"
          value={pkg.tier ?? ''}
          readOnly={readOnly}
          onChange={(e) => onChange({ tier: e.target.value || null })}
          className="w-28 rounded border border-nativz-border bg-background px-2 py-1 text-xs text-text-primary"
        />
        {!readOnly ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-text-muted hover:text-coral-300"
            aria-label="Remove package"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </header>

      <label className="mt-2 block">
        <span className="sr-only">Description</span>
        <input
          type="text"
          placeholder="Short description (optional)"
          value={pkg.description ?? ''}
          readOnly={readOnly}
          onChange={(e) => onChange({ description: e.target.value || null })}
          className="w-full rounded border border-nativz-border bg-background px-2 py-1 text-xs text-text-secondary"
        />
      </label>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-wider text-text-muted">
        <label className="block">
          Setup ($)
          <input
            type="number"
            step="0.01"
            min="0"
            value={pkg.setup_cents != null ? centsToDollars(pkg.setup_cents) : ''}
            readOnly={readOnly}
            onChange={(e) =>
              onChange({
                setup_cents:
                  e.target.value === '' ? null : dollarsToCents(e.target.value),
              } as Partial<Package>)
            }
            className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1 font-mono text-xs text-text-primary"
          />
        </label>
        <label className="block">
          Monthly ($)
          <input
            type="number"
            step="0.01"
            min="0"
            value={pkg.monthly_cents != null ? centsToDollars(pkg.monthly_cents) : ''}
            readOnly={readOnly}
            onChange={(e) =>
              onChange({
                monthly_cents:
                  e.target.value === '' ? null : dollarsToCents(e.target.value),
              } as Partial<Package>)
            }
            className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1 font-mono text-xs text-text-primary"
          />
        </label>
        <label className="block">
          Annual ($)
          <input
            type="number"
            step="0.01"
            min="0"
            value={pkg.annual_cents != null ? centsToDollars(pkg.annual_cents) : ''}
            readOnly={readOnly}
            onChange={(e) =>
              onChange({
                annual_cents:
                  e.target.value === '' ? null : dollarsToCents(e.target.value),
              } as Partial<Package>)
            }
            className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1 font-mono text-xs text-text-primary"
          />
        </label>
      </div>

      <div className="mt-3 space-y-1">
        {deliverables.map((d) => (
          <div key={d.id} className="flex items-center gap-2">
            <input
              type="text"
              value={d.name}
              readOnly={readOnly}
              onChange={(e) => onUpdateDeliverable(d.id, { name: e.target.value })}
              className="flex-1 rounded border border-nativz-border bg-background px-2 py-1 text-xs text-text-primary"
            />
            <input
              type="text"
              placeholder="qty (e.g. 15/mo)"
              value={d.quantity ?? ''}
              readOnly={readOnly}
              onChange={(e) => onUpdateDeliverable(d.id, { quantity: e.target.value || null })}
              className="w-28 rounded border border-nativz-border bg-background px-2 py-1 text-xs text-text-muted"
            />
            {!readOnly ? (
              <button
                type="button"
                onClick={() => onRemoveDeliverable(d.id)}
                className="text-text-muted hover:text-coral-300"
                aria-label="Remove deliverable"
              >
                <Trash2 size={12} />
              </button>
            ) : null}
          </div>
        ))}
        {!readOnly ? (
          <button
            type="button"
            onClick={onAddDeliverable}
            className="inline-flex items-center gap-1 text-[11px] text-nz-cyan hover:text-nz-cyan/80"
          >
            <Plus size={11} /> Add deliverable
          </button>
        ) : null}
      </div>
    </div>
  );
}
