/**
 * TierCard — render a single `package_tiers` row for /deliverables.
 *
 * Phase D replaces the inferred `ScopePanel` story with a real card that
 * reads display_name + blurb + price + scope_in + scope_out from the row.
 * Used in two contexts:
 *   • /deliverables (client-facing, shows the assigned tier in active state)
 *   • Admin tier picker modal (shows every tier for the agency, side-by-side)
 *
 * The visual hierarchy mirrors the Anderson Collaborative pricing page so a
 * client moving between cortex.nativz.io/deliverables and the public
 * pricing page sees consistent typography weight + bullet density.
 */

import { CheckCircle2, MinusCircle, Sparkles } from 'lucide-react';

export interface TierCardData {
  id: string;
  slug: string;
  displayName: string;
  blurb: string;
  priceCents: number;
  scopeIn: string;          // newline-separated bullets
  scopeOut: string;         // single sentence
  isBestValue: boolean;
  monthlyTermMinimumMonths: number;
  /** Per-deliverable-type counts for this tier; sorted by sort_order. */
  allotments: Array<{
    deliverableTypeSlug: string;
    label: string;
    monthlyCount: number;
  }>;
}

interface TierCardProps {
  tier: TierCardData;
  /** When true, renders the "currently on this tier" treatment. */
  active?: boolean;
  /** When true, renders the picker variant (denser, button at bottom). */
  selectable?: boolean;
  onSelect?: () => void;
  selecting?: boolean;
}

function fmtUsd(cents: number): string {
  if (cents % 100 === 0) {
    return `$${(cents / 100).toLocaleString('en-US')}`;
  }
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function TierCard({
  tier,
  active = false,
  selectable = false,
  onSelect,
  selecting = false,
}: TierCardProps) {
  // The first bullet uses the literal newline-split; subsequent bullets
  // become individual <li> rows. Empty trailing newlines are dropped.
  const bullets = tier.scopeIn
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  return (
    <article
      className={`relative flex flex-col rounded-2xl border bg-surface p-6 transition-colors ${
        active
          ? 'border-accent-text/60 shadow-[0_0_0_1px_rgba(96,165,250,0.25)]'
          : 'border-nativz-border'
      }`}
    >
      {tier.isBestValue ? (
        <span className="absolute -top-2 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--accent-contrast)]">
          <Sparkles size={10} aria-hidden /> Best value
        </span>
      ) : null}

      <header className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          {active ? 'Your plan' : 'Plan'}
        </p>
        <h3 className="text-xl font-semibold text-text-primary">{tier.displayName}</h3>
        <p className="text-[13px] text-text-secondary">{tier.blurb}</p>
      </header>

      <div className="mt-4 flex items-baseline gap-2">
        <p className="font-mono text-3xl font-semibold text-text-primary">
          {fmtUsd(tier.priceCents)}
        </p>
        <span className="text-[12px] text-text-muted">per month</span>
      </div>
      <p className="mt-0.5 text-[11px] text-text-muted">
        {tier.monthlyTermMinimumMonths}-month minimum term
      </p>

      {tier.allotments.length > 0 ? (
        <div className="mt-4 rounded-xl border border-nativz-border/60 bg-background/40 p-3">
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Monthly output</p>
          <ul className="mt-2 space-y-1">
            {tier.allotments.map((a) => (
              <li key={a.deliverableTypeSlug} className="flex items-baseline justify-between text-[12px]">
                <span className="text-text-secondary">{a.label}</span>
                <span className="font-mono text-text-primary">{a.monthlyCount}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bullets.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px]">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
              <span className="text-text-secondary">{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {tier.scopeOut ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-nativz-border/70 bg-background/40 p-3 text-[12px]">
          <MinusCircle size={13} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
          <p className="text-text-secondary">
            <span className="text-text-muted">Out of scope: </span>
            {tier.scopeOut}
          </p>
        </div>
      ) : null}

      {selectable ? (
        <button
          type="button"
          onClick={onSelect}
          disabled={selecting || active}
          className={`mt-5 w-full rounded-lg px-3 py-2 text-[12px] font-medium transition-colors ${
            active
              ? 'cursor-default border border-accent-text/40 bg-background text-text-muted'
              : 'bg-accent text-[color:var(--accent-contrast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
          }`}
        >
          {active ? 'Current plan' : selecting ? 'Switching…' : 'Switch to this plan'}
        </button>
      ) : null}
    </article>
  );
}
