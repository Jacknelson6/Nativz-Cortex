'use client';

/**
 * AddOnSection, replaces the 5/10/25 "credit pack" CTAs with named SKUs.
 *
 * Per the directional pivot: the client's purchase model is "buy a deliverable"
 * (Extra Edited Video, UGC-Style Video) plus the SLA modifier (Rush). Each
 * card is an explicit named purchase, not an opaque credit pack.
 *
 * Behaviour:
 *   • POSTs `{ clientId, addon_slug }` to `/api/credits/checkout`.
 *   • On success, navigates the window to the returned Stripe URL.
 *   • On 503 (SKU not configured for this agency), shows a calm inline note
 *     instead of a red error, the client should fall back to "reach out".
 *   • Card grid stays single-column on mobile, 3-up on desktop.
 *
 * Configured-only filtering happens server-side: the parent passes the
 * already-filtered `addons` list (via `listConfiguredAddons(agency)`) so this
 * component is presentational from a routing perspective.
 */

import { useState } from 'react';
import { Loader2, ShoppingBag, Zap, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AddonSku, AddonSlug } from '@/lib/deliverables/addon-skus';

interface AddOnSectionProps {
  clientId: string;
  brandName: string;
  addons: AddonSku[];
}

// Per-slug iconography keeps the cards readable at a glance without
// inventing a new visual language. Stays inside lucide so the icon set is
// consistent with the rest of the admin surface.
const ICON: Record<AddonSlug, LucideIcon> = {
  extra_edited_video: Video,
  extra_ugc_video: Video,
  rush_upgrade: Zap,
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function AddOnSection({ clientId, brandName, addons }: AddOnSectionProps) {
  const [busySlug, setBusySlug] = useState<AddonSlug | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (addons.length === 0) {
    // Stripe price ids not configured for this agency yet. Render a single
    // calm card so the surface still tells the client what's possible.
    return (
      <section className="rounded-2xl border border-nativz-border bg-surface p-6">
        <header className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
            Need more this month?
          </p>
          <h2 className="text-lg font-semibold text-text-primary">Add-ons</h2>
          <p className="max-w-prose text-[13px] text-text-secondary">
            Self-serve add-ons aren&apos;t enabled for {brandName} yet. Reach out to your Nativz
            contact and we&apos;ll line one up the same day.
          </p>
        </header>
      </section>
    );
  }

  async function buy(slug: AddonSlug) {
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
      // Leave spinner spinning if we're navigating away, resetting flashes
      // the button back to enabled briefly during the redirect.
      if (!redirected) setBusySlug(null);
    }
  }

  return (
    <section className="rounded-2xl border border-nativz-border bg-surface p-6">
      <header className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Need more this month?
        </p>
        <h2 className="text-lg font-semibold text-text-primary">Add-ons</h2>
        <p className="max-w-prose text-[13px] text-text-secondary">
          Buy an extra deliverable when scope runs short. Each one is invoiced on its own and
          delivered alongside your next batch.
        </p>
      </header>

      {error ? (
        <p className="mt-4 rounded-xl border border-coral-300/30 bg-coral-300/5 px-3 py-2 text-[12px] text-coral-300">
          {error}
        </p>
      ) : null}

      <ul className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {addons.map((sku) => {
          const Icon = ICON[sku.slug];
          const busy = busySlug === sku.slug;
          return (
            <li
              key={sku.slug}
              className="flex flex-col rounded-xl border border-nativz-border bg-background/40 p-4"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-text/10 text-accent-text">
                  <Icon size={16} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-text-primary">{sku.label}</p>
                  <p className="mt-0.5 text-[12px] text-text-muted">{sku.card_subtitle}</p>
                </div>
              </div>

              <p className="mt-3 text-[12px] text-text-secondary">{sku.description}</p>

              <div className="mt-4 flex items-end justify-between gap-3">
                <p className="font-mono text-xl text-text-primary">
                  {formatPrice(sku.price_cents)}
                  <span className="ml-1 text-[11px] font-normal text-text-muted">
                    {sku.slug === 'rush_upgrade' ? 'per asset' : 'each'}
                  </span>
                </p>
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
                  Buy
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
