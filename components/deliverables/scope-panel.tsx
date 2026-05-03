/**
 * ScopePanel — "What's in scope this month" summary on /deliverables.
 *
 * Reads a `ScopeTier` (from `lib/deliverables/scope.ts`) and renders:
 *   • A short blurb describing the tier's positioning
 *   • Per-type bullets for active types only (filters by hasRow)
 *   • A sentence-cased "out of scope" line so the boundaries are explicit
 *
 * Phase D replaces the inferred tier with a column read on the client row,
 * but the component contract (ScopeTier in / panel out) stays the same.
 */

import { CheckCircle2, MinusCircle } from 'lucide-react';
import type { ScopeTier } from '@/lib/deliverables/scope';
import type { DeliverableBalance } from '@/lib/deliverables/get-balances';
import { deliverableCopy } from '@/lib/deliverables/copy';

interface ScopePanelProps {
  tier: ScopeTier;
  balances: DeliverableBalance[];
}

export function ScopePanel({ tier, balances }: ScopePanelProps) {
  // Only show inclusion bullets for types the client actually has, so the
  // panel doesn't promise a deliverable that isn't provisioned yet.
  const activeSlugs = new Set(
    balances.filter((b) => b.hasRow).map((b) => b.deliverableTypeSlug),
  );

  const bullets = (Object.entries(tier.inclusions) as Array<
    [keyof typeof tier.inclusions, string]
  >)
    .filter(([slug]) => activeSlugs.has(slug as never))
    .map(([slug, sentence]) => ({
      slug,
      label: deliverableCopy(slug as never).shortLabel,
      sentence,
    }));

  return (
    <section className="rounded-2xl border border-nativz-border bg-surface p-6">
      <header className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          This month&apos;s scope
        </p>
        <h2 className="text-lg font-semibold text-text-primary">{tier.label} package</h2>
        <p className="max-w-prose text-[13px] text-text-secondary">{tier.blurb}</p>
      </header>

      {bullets.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {bullets.map((b) => (
            <li key={String(b.slug)} className="flex items-start gap-3 text-[13px]">
              <CheckCircle2
                size={14}
                className="mt-0.5 shrink-0 text-accent-text"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="font-medium text-text-primary">{b.label}</p>
                <p className="text-text-secondary">{b.sentence}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-[13px] text-text-muted">
          No active deliverables on this account yet. Reach out and we&apos;ll get the first month
          provisioned.
        </p>
      )}

      {tier.outOfScope.length > 0 ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-nativz-border/70 bg-background/40 p-3 text-[12px]">
          <MinusCircle
            size={13}
            className="mt-0.5 shrink-0 text-text-muted"
            aria-hidden
          />
          <p className="text-text-secondary">
            <span className="text-text-muted">Out of scope: </span>
            {tier.outOfScope.join(', ')}.
          </p>
        </div>
      ) : null}
    </section>
  );
}
