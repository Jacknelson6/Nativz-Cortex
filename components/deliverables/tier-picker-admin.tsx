'use client';

/**
 * TierPickerAdmin, admin-only modal that lists every active tier for the
 * client's agency and lets the operator assign one (or change the assigned
 * tier mid-period). Wires into the same `applyTierChange` helper as the
 * Stripe webhook handler so a manual override and a Stripe-driven swap
 * share the proration logic.
 *
 * Open/close is owned by the caller via `open` + `onClose`. Re-fetches the
 * catalog every time the modal opens so a freshly seeded tier shows up
 * without a hard refresh.
 *
 * Confirmation:
 *   • First click on a tier card sets `pendingTierId` (highlights the card).
 *   • Second click on the same card commits via POST /tier; the modal then
 *     refreshes the parent route on success.
 * This avoids a Stripe-style multi-step confirmation modal while still
 * preventing fat-finger mid-period swaps.
 */

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { TierCard, type TierCardData } from './tier-card';

interface TiersResponse {
  tiers: TierCardData[];
  currentTierId: string | null;
  agency: 'nativz' | 'anderson';
}

interface AppliedRow {
  deliverableTypeSlug: string;
  oldMonthlyCount: number | null;
  newMonthlyCount: number;
  proratedDelta: number;
  rowCreated: boolean;
  alreadyApplied: boolean;
}

interface AppliedSummary {
  newTierDisplayName: string;
  rows: AppliedRow[];
}

interface TierPickerAdminProps {
  clientId: string;
  open: boolean;
  onClose: () => void;
}

export function TierPickerAdmin({ clientId, open, onClose }: TierPickerAdminProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TiersResponse | null>(null);
  const [pendingTierId, setPendingTierId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedSummary | null>(null);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deliverables/${clientId}/tiers`);
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok) {
        throw new Error(
          (json && (json as { error?: string }).error) || `Failed to load tiers (${res.status})`,
        );
      }
      setData(json as TiersResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tiers');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (open) {
      setApplied(null);
      setPendingTierId(null);
      void fetchCatalog();
    }
  }, [open, fetchCatalog]);

  // Esc-to-close. We attach the listener while open and clean up on close
  // so the picker doesn't swallow Esc presses on other surfaces.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleSelect(tierId: string) {
    if (!data) return;
    if (tierId === data.currentTierId) return;
    if (pendingTierId !== tierId) {
      setPendingTierId(tierId);
      return;
    }
    setSubmittingId(tierId);
    setError(null);
    try {
      const res = await fetch(`/api/deliverables/${clientId}/tier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier_id: tierId }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok) {
        throw new Error(
          (json && (json as { error?: string }).error) || `Tier change failed (${res.status})`,
        );
      }
      setApplied({
        newTierDisplayName: (json as { newTierDisplayName: string }).newTierDisplayName,
        rows: (json as { rows: AppliedRow[] }).rows,
      });
      setPendingTierId(null);
      // Refresh parent so /deliverables re-reads the new tier ids + balances.
      startTransition(() => router.refresh());
      // Re-fetch the catalog so currentTierId updates inline.
      void fetchCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tier change failed');
    } finally {
      setSubmittingId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-12 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tier-picker-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl rounded-2xl border border-nativz-border bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tier picker"
          className="absolute right-4 top-4 rounded-md p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
        >
          <X size={16} />
        </button>

        <header className="space-y-1 pr-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
            Admin · tier picker
          </p>
          <h2 id="tier-picker-title" className="text-xl font-semibold text-text-primary">
            Assign or change package tier
          </h2>
          <p className="max-w-prose text-[13px] text-text-secondary">
            Click a tier once to highlight it, then click again to confirm. Changes mid-period
            are prorated for the days remaining and idempotent on retry.
          </p>
        </header>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-coral-300/30 bg-coral-300/5 p-3 text-sm text-coral-300">
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
          </div>
        ) : null}

        {applied ? (
          <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/5 p-3 text-[13px] text-emerald-300">
            <p className="font-medium">Switched to {applied.newTierDisplayName}.</p>
            <ul className="mt-2 space-y-0.5 text-[12px] text-emerald-300/80">
              {applied.rows.map((r) => (
                <li key={r.deliverableTypeSlug} className="font-mono">
                  {r.deliverableTypeSlug}: {r.oldMonthlyCount ?? 0} to {r.newMonthlyCount}
                  {' · prorated delta '}
                  {r.proratedDelta > 0 ? `+${r.proratedDelta}` : r.proratedDelta}
                  {r.alreadyApplied ? ' (already applied)' : ''}
                  {r.rowCreated ? ' (provisioned)' : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading tier catalog...
          </div>
        ) : data && data.tiers.length === 0 ? (
          <div className="mt-8 rounded-xl border border-amber-300/30 bg-amber-300/5 p-5 text-sm text-amber-300">
            No active tiers configured for this agency yet. Seed `package_tiers` rows for{' '}
            <span className="font-mono">{data.agency}</span> via migration to populate this list.
          </div>
        ) : data ? (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {data.tiers.map((tier) => {
              const isActive = tier.id === data.currentTierId;
              const isPending = tier.id === pendingTierId && !isActive;
              return (
                <div
                  key={tier.id}
                  className={`rounded-2xl transition-shadow ${
                    isPending ? 'shadow-[0_0_0_2px_rgba(96,165,250,0.5)]' : ''
                  }`}
                >
                  <TierCard
                    tier={tier}
                    active={isActive}
                    selectable
                    selecting={submittingId === tier.id}
                    onSelect={() => handleSelect(tier.id)}
                  />
                  {isPending ? (
                    <p className="mt-2 text-center text-[11px] text-accent-text">
                      Click again to confirm switch.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
