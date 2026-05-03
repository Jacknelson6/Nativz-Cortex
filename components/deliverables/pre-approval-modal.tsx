'use client';

/**
 * PreApprovalModal, soft-block at zero balance.
 *
 * Shown when a client clicks "Approve" on a share-link review and the
 * matching deliverable type has `current_balance <= 0`. The modal explains
 * why approval is gated, then offers two paths:
 *
 *   A. Buy a matching add-on (kicks off Stripe checkout via
 *      /api/credits/checkout). Restricted to add-ons that match the
 *      deliverable type: an edited-video approval surfaces only the
 *      "Extra Edited Video" SKU, etc. SLA modifiers (Rush) are filtered
 *      out because they don't add to a balance bucket.
 *
 *   B. Talk to the account manager (mailto link to the agency support
 *      address). The address is supplied by the parent so the modal stays
 *      brand-agnostic.
 *
 * The gate is bypassed entirely for clients with `allow_silent_overage`
 * set TRUE on `clients`; that check happens in the consume RPC + the
 * caller's `clientAllowsOverage` lookup, not inside the modal. By the
 * time this modal opens we already know the client should see it.
 */

import { useState } from 'react';
import { AlertCircle, Loader2, Mail, ShoppingBag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AddonSku } from '@/lib/deliverables/addon-skus';
import type { DeliverableTypeSlug } from '@/lib/credits/types';
import { deliverableCopy } from '@/lib/deliverables/copy';

interface PreApprovalModalProps {
  open: boolean;
  onClose: () => void;
  /** Client whose balance hit zero. Used as the Stripe checkout subject. */
  clientId: string;
  /** Type of deliverable being approved (edited_video, ugc_video, etc). */
  deliverableTypeSlug: DeliverableTypeSlug;
  /** Brand label shown in the modal copy ("Acme deliverables"). */
  brandName: string;
  /** Configured add-ons for the agency (already filtered by env). */
  addons: AddonSku[];
  /** Mailto address for the "Talk to your AM" CTA. */
  supportEmail: string;
  /** Optional: title / subject of the asset under review (audit context). */
  assetTitle?: string;
}

export function PreApprovalModal({
  open,
  onClose,
  clientId,
  deliverableTypeSlug,
  brandName,
  addons,
  supportEmail,
  assetTitle,
}: PreApprovalModalProps) {
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = deliverableCopy(deliverableTypeSlug);

  // Filter to add-ons that actually credit this type's balance bucket. SLA
  // modifiers (rush_upgrade, deliverable_type_slug = null) are excluded -
  // those don't fix the zero-balance gate.
  const relevantAddons = addons.filter(
    (a) => a.deliverable_type_slug === deliverableTypeSlug,
  );

  async function buy(slug: string) {
    setBusySlug(slug);
    setError(null);
    let redirected = false;
    try {
      const res = await fetch('/api/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, addon_slug: slug }),
      });
      const text = await res.text();
      const json = text
        ? (JSON.parse(text) as { url?: string; error?: string })
        : null;
      if (!res.ok || !json?.url) {
        throw new Error(json?.error ?? `Checkout unavailable (${res.status})`);
      }
      redirected = true;
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout');
    } finally {
      if (!redirected) setBusySlug(null);
    }
  }

  if (!open) return null;

  const subjectLine = assetTitle
    ? `Out of ${copy.shortLabel} for ${brandName}, approving "${assetTitle}"`
    : `Out of ${copy.shortLabel} for ${brandName}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-12 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pre-approval-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl border border-nativz-border bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
        >
          <X size={16} />
        </button>

        <header className="space-y-1 pr-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
            One quick check
          </p>
          <h2 id="pre-approval-title" className="text-xl font-semibold text-text-primary">
            You&apos;re out of {copy.plural} this month
          </h2>
          <p className="max-w-prose text-[13px] text-text-secondary">
            {brandName}&apos;s monthly scope for {copy.plural} is fully booked. Approving this
            asset would push you past the included allotment. Pick how you&apos;d like to handle it.
          </p>
        </header>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-coral-300/30 bg-coral-300/5 p-3 text-sm text-coral-300">
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
          </div>
        ) : null}

        {/* Option A: buy a matching add-on. */}
        {relevantAddons.length > 0 ? (
          <section className="mt-5 space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-text-muted">
              Option A · buy a one-off
            </p>
            <ul className="space-y-2">
              {relevantAddons.map((sku) => {
                const busy = busySlug === sku.slug;
                return (
                  <li
                    key={sku.slug}
                    className="flex items-center justify-between gap-3 rounded-xl border border-nativz-border bg-surface p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-text-primary">{sku.label}</p>
                      <p className="mt-0.5 text-[12px] text-text-muted">{sku.card_subtitle}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[14px] text-text-primary">
                        ${(sku.price_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => buy(sku.slug)}
                        disabled={busySlug !== null}
                        aria-label={`Buy ${sku.label}`}
                      >
                        {busy ? (
                          <Loader2 size={14} className="animate-spin" aria-hidden />
                        ) : (
                          <ShoppingBag size={14} aria-hidden />
                        )}
                        Buy and approve
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 text-[12px] text-amber-300">
            Self-serve add-ons aren&apos;t configured for this agency yet. Use Option B below or
            wait until next month&apos;s reset.
          </section>
        )}

        {/* Option B: contact AM. */}
        <section className="mt-5 space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-text-muted">
            Option B · talk to your account manager
          </p>
          <a
            href={`mailto:${supportEmail}?subject=${encodeURIComponent(subjectLine)}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-nativz-border bg-surface p-3 transition-colors hover:border-accent-text/40"
          >
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-text-primary">Email {supportEmail}</p>
              <p className="mt-0.5 text-[12px] text-text-muted">
                We&apos;ll line up an extra deliverable on a same-day turnaround.
              </p>
            </div>
            <Mail size={16} className="shrink-0 text-text-muted" aria-hidden />
          </a>
        </section>

        <p className="mt-5 text-[11px] text-text-muted">
          Nothing has been approved yet. Closing this dialog leaves the asset waiting for review.
        </p>
      </div>
    </div>
  );
}
