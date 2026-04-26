'use client';

import { useMemo, useState } from 'react';
import { Loader2, Check } from 'lucide-react';

type TierPreview = {
  id: string;
  name: string;
  monthly_cents?: number | null;
  total_cents?: number | null;
  deposit_cents?: number | null;
  cadence?: 'month' | 'year' | 'week' | null;
  subscription?: boolean | null;
  stripe_payment_link?: string | null;
};

interface OfferSignFormProps {
  slug: string;
  templateId: string;
  templateName: string;
  agency: 'anderson' | 'nativz';
  tiers: TierPreview[];
}

function formatTierPrice(tier: TierPreview): string {
  const cents = tier.monthly_cents ?? tier.total_cents ?? 0;
  if (!cents) return '—';
  const dollars = Math.round(cents / 100);
  const formatted = dollars.toLocaleString();
  if (tier.subscription || tier.cadence) {
    return `$${formatted} / ${tier.cadence ?? 'month'}`;
  }
  return `$${formatted}`;
}

export function OfferSignForm({ slug, templateId, templateName, agency, tiers }: OfferSignFormProps) {
  const [tierId, setTierId] = useState<string>(tiers[0]?.id ?? '');
  const [clientLegalName, setClientLegalName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [typedSignature, setTypedSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selectedTier = useMemo(() => tiers.find((t) => t.id === tierId), [tierId, tiers]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!tierId || !selectedTier) {
      setError('Pick a tier.');
      return;
    }
    if (!clientLegalName.trim() || !signerName.trim() || !signerEmail.trim() || !signerTitle.trim()) {
      setError('Fill in every required field.');
      return;
    }
    if (!typedSignature.trim()) {
      setError('Type your full name to sign.');
      return;
    }
    if (typedSignature.trim().toLowerCase() !== signerName.trim().toLowerCase()) {
      setError('Typed signature must match your full name exactly.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/offer/${encodeURIComponent(slug)}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          templateId,
          tier: tierId,
          tierLabel: selectedTier.name,
          clientLegalName: clientLegalName.trim(),
          clientAddress: clientAddress.trim() || null,
          signerName: signerName.trim(),
          signerTitle: signerTitle.trim(),
          signerEmail: signerEmail.trim(),
          typedSignature: typedSignature.trim(),
          agency,
          timestamp: new Date().toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Signing failed (${res.status})`);
        return;
      }
      setDone(true);
      if (json.redirectUrl) {
        window.location.href = json.redirectUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-surface">
          <Check size={20} className="text-accent-text" />
        </div>
        <p className="text-base font-medium">Signed. Redirecting to payment…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-text-primary">Pick your tier</legend>
        <div className="grid gap-3">
          {tiers.map((tier) => {
            const isSelected = tier.id === tierId;
            return (
              <label
                key={tier.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                  isSelected
                    ? 'border-accent-text bg-accent-surface/40'
                    : 'border-nativz-border bg-surface hover:border-text-muted'
                }`}
              >
                <input
                  type="radio"
                  name="tier"
                  value={tier.id}
                  checked={isSelected}
                  onChange={() => setTierId(tier.id)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold text-text-primary">{tier.name}</p>
                    <p className="text-sm font-medium text-text-secondary">{formatTierPrice(tier)}</p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-text-primary">Signer details</legend>
        <Field label="Legal entity name" value={clientLegalName} onChange={setClientLegalName} required />
        <Field label="Mailing address (optional)" value={clientAddress} onChange={setClientAddress} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your full name" value={signerName} onChange={setSignerName} required />
          <Field label="Title" value={signerTitle} onChange={setSignerTitle} required />
        </div>
        <Field label="Email" type="email" value={signerEmail} onChange={setSignerEmail} required />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-text-primary">Sign</legend>
        <p className="text-xs text-text-muted">
          Type your full name exactly as entered above to electronically sign this {templateName} agreement.
        </p>
        <input
          type="text"
          value={typedSignature}
          onChange={(e) => setTypedSignature(e.target.value)}
          placeholder="Type your full name"
          className="w-full rounded-md border border-nativz-border bg-surface px-3 py-2 font-serif text-2xl text-text-primary focus:border-accent-text focus:outline-none"
          required
        />
      </fieldset>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-text px-4 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Signing…
          </>
        ) : (
          <>Sign and continue to payment</>
        )}
      </button>

      <p className="text-center text-xs text-text-muted">
        By signing you agree to the {templateName} terms. You'll be redirected to Stripe to complete your first payment.
      </p>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-text-muted">
        {label}
        {required ? <span className="text-red-400"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-md border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent-text focus:outline-none"
      />
    </label>
  );
}
