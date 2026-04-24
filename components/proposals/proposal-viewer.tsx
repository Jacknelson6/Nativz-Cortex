'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';

type Proposal = {
  id: string;
  slug: string;
  title: string;
  status: string;
  scope_statement: string | null;
  total_cents: number | null;
  deposit_cents: number | null;
  currency: string;
  signer_name: string | null;
  signer_email: string | null;
  signer_title: string | null;
  stripe_payment_link_url: string | null;
  sent_at: string | null;
  signed_at: string | null;
  paid_at: string | null;
};

type Package = {
  id: string;
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

export function ProposalViewer({
  proposal,
  packages,
  deliverables,
  expired,
  body,
  terms,
  formatCents,
}: {
  proposal: Proposal;
  packages: Package[];
  deliverables: Deliverable[];
  expired: boolean;
  body: ReactNode;
  terms: ReactNode;
  formatCents: (cents: number, currency?: string) => string;
}) {
  const [signed, setSigned] = useState(['signed', 'paid'].includes(proposal.status));
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(
    proposal.stripe_payment_link_url,
  );

  useEffect(() => {
    fetch(`/api/proposals/public/${proposal.slug}/view`, { method: 'POST' }).catch(() => {});
  }, [proposal.slug]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Proposal · {proposal.status}
        </span>
        {expired ? (
          <span className="rounded-full bg-coral-500/10 px-2 py-0.5 text-[11px] text-coral-300">
            Expired
          </span>
        ) : proposal.signed_at ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
            <CheckCircle2 size={12} /> Signed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-nz-cyan/10 px-2 py-0.5 text-[11px] text-nz-cyan">
            <Clock size={12} /> Awaiting signature
          </span>
        )}
      </div>

      <h1 className="text-4xl font-semibold tracking-tight text-text-primary">{proposal.title}</h1>
      {proposal.scope_statement ? (
        <p className="mt-3 text-lg text-text-secondary">{proposal.scope_statement}</p>
      ) : null}

      {body ? (
        <div className="prose prose-invert mt-8 max-w-none text-text-secondary">{body}</div>
      ) : null}

      {packages.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-text-primary">Packages</h2>
          <div className="mt-4 space-y-3">
            {packages.map((pkg) => {
              const pkgDeliverables = deliverables.filter((d) => d.package_id === pkg.id);
              return (
                <article
                  key={pkg.id}
                  className="rounded-xl border border-nativz-border bg-surface p-5"
                >
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold text-text-primary">
                      {pkg.name}
                      {pkg.tier ? (
                        <span className="ml-2 rounded-full bg-nz-cyan/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-nz-cyan">
                          {pkg.tier}
                        </span>
                      ) : null}
                    </h3>
                    <p className="font-mono text-sm text-text-secondary">
                      {pkg.monthly_cents != null ? (
                        <>
                          {formatCents(pkg.monthly_cents, proposal.currency)}
                          <span className="text-text-muted"> / mo</span>
                        </>
                      ) : null}
                      {pkg.setup_cents ? (
                        <span className="ml-3 text-text-muted">
                          + {formatCents(pkg.setup_cents, proposal.currency)} setup
                        </span>
                      ) : null}
                    </p>
                  </header>
                  {pkg.description ? (
                    <p className="mt-1 text-sm text-text-secondary">{pkg.description}</p>
                  ) : null}
                  {pkgDeliverables.length > 0 ? (
                    <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {pkgDeliverables.map((d) => (
                        <li key={d.id} className="flex gap-2 text-sm text-text-secondary">
                          <span className="text-nz-cyan">•</span>
                          <span>{d.name}</span>
                          {d.quantity ? (
                            <span className="text-text-muted">{d.quantity}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>
          {proposal.total_cents ? (
            <p className="mt-4 text-right text-sm text-text-muted">
              Total due at signing:{' '}
              <span className="font-mono text-base text-text-primary">
                {formatCents(
                  proposal.deposit_cents ?? proposal.total_cents,
                  proposal.currency,
                )}
              </span>
            </p>
          ) : null}
        </section>
      ) : null}

      {terms ? (
        <section className="mt-10 rounded-xl border border-nativz-border bg-surface p-5">
          <div className="prose prose-invert prose-sm max-w-none text-text-secondary">{terms}</div>
        </section>
      ) : null}

      {expired ? (
        <div className="mt-8 rounded-xl border border-coral-500/30 bg-coral-500/5 p-4 text-sm text-coral-200">
          This proposal expired. Reach out to us for a refreshed version.
        </div>
      ) : !signed ? (
        <SignForm
          slug={proposal.slug}
          defaults={{
            signer_name: proposal.signer_name ?? '',
            signer_email: proposal.signer_email ?? '',
            signer_title: proposal.signer_title ?? '',
          }}
          onSigned={(url) => {
            setSigned(true);
            if (url) setPaymentLinkUrl(url);
          }}
        />
      ) : null}

      {signed && paymentLinkUrl && !proposal.paid_at ? (
        <div className="mt-6 rounded-xl border border-nz-cyan/30 bg-nz-cyan/5 p-5 text-center">
          <p className="text-sm text-text-primary">
            Signed — last step is the deposit payment.
          </p>
          <a
            href={paymentLinkUrl}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-nz-cyan px-5 py-2 text-sm font-medium text-background hover:bg-nz-cyan/90"
          >
            Pay deposit
          </a>
        </div>
      ) : null}

      {signed && !paymentLinkUrl ? (
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center text-sm text-emerald-200">
          Thanks — your signed proposal is saved. We&rsquo;ll reach out with next steps shortly.
        </div>
      ) : null}
    </main>
  );
}

function SignForm({
  slug,
  defaults,
  onSigned,
}: {
  slug: string;
  defaults: { signer_name: string; signer_email: string; signer_title: string };
  onSigned: (paymentLinkUrl: string | null) => void;
}) {
  const [form, setForm] = useState(defaults);
  const [typed, setTyped] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!agree) {
      setError('Please agree to the terms.');
      return;
    }
    if (typed.trim().length < 2) {
      setError('Type your full name to sign.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/proposals/public/${slug}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          signer_name: form.signer_name,
          signer_email: form.signer_email,
          signer_title: form.signer_title || null,
          typed_signature: typed,
          agree_terms: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Sign failed');
        setBusy(false);
        return;
      }
      onSigned(json.paymentLinkUrl ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 rounded-xl border border-nativz-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-text-primary">Sign this proposal</h2>
      <p className="mt-1 text-sm text-text-muted">
        Type your name below to sign. Your IP, timestamp, and email are recorded for auditability.
      </p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Full name</span>
          <input
            type="text"
            required
            value={form.signer_name}
            onChange={(e) => setForm((f) => ({ ...f, signer_name: e.target.value }))}
            className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Email</span>
          <input
            type="email"
            required
            value={form.signer_email}
            onChange={(e) => setForm((f) => ({ ...f, signer_email: e.target.value }))}
            className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Title (optional)</span>
          <input
            type="text"
            value={form.signer_title}
            onChange={(e) => setForm((f) => ({ ...f, signer_title: e.target.value }))}
            className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Type your full name to sign</span>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Your full legal name"
            className="w-full rounded border border-nativz-border bg-background px-3 py-3 font-serif italic text-lg text-text-primary"
          />
        </label>
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-1"
        />
        <span>
          I agree to the scope and terms above, and confirm that I have authority to sign on behalf
          of the signing entity.
        </span>
      </label>
      {error ? <p className="mt-3 text-sm text-coral-300">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-full bg-nz-cyan py-2.5 text-sm font-medium text-background hover:bg-nz-cyan/90 disabled:opacity-50"
      >
        {busy ? 'Signing…' : 'Sign proposal'}
      </button>
    </form>
  );
}
