/**
 * Package-tier scope summary (Phase B stub).
 *
 * Phase B's `/deliverables` page renders a "What's in scope this month"
 * panel sourced from the client's package tier. Phase D promotes named
 * tiers (`launch`, `growth`, `signature`, etc.) to a first-class entity on
 * `clients.package_tier_slug`. Until that lands, the tier is derived from
 * the client's deliverable allowances using a coarse heuristic: the
 * combined monthly_allowance across types maps to a single tier label.
 *
 * The panel content is fully static per tier so this stub is correct
 * enough, the real Phase D version pulls bullets + out-of-scope copy
 * from a `package_tiers` table. No DB calls in this file.
 */

import type { DeliverableBalance } from './get-balances';
import type { DeliverableTypeSlug } from '@/lib/credits/types';

export type ScopeTierSlug = 'starter' | 'growth' | 'signature' | 'enterprise';

export interface ScopeTier {
  slug: ScopeTierSlug;
  label: string;
  /** One-sentence positioning shown directly under the tier label. */
  blurb: string;
  /** Per-type bullets shown in the "what's included" list. */
  inclusions: Partial<Record<DeliverableTypeSlug, string>>;
  /** Sentence-cased list of explicit exclusions, joined with commas. */
  outOfScope: string[];
}

const TIERS: Record<ScopeTierSlug, ScopeTier> = {
  starter: {
    slug: 'starter',
    label: 'Starter',
    blurb: 'A focused pilot scope to test the production engine.',
    inclusions: {
      edited_video:
        'Vertical short-form edits with captions, music, and one round of revisions.',
      static_graphic:
        'Single-frame social posts in batched delivery.',
    },
    outOfScope: ['long-form', 'ad creative', 'paid spend'],
  },
  growth: {
    slug: 'growth',
    label: 'Growth',
    blurb: 'A steady monthly cadence across edited video and creator-led posts.',
    inclusions: {
      edited_video:
        'Vertical short-form edits with captions, music, and one round of revisions.',
      ugc_video:
        'Original creator-style short videos delivered on a monthly cadence.',
      static_graphic:
        'Cortex-produced single-frame social posts, batched.',
    },
    outOfScope: ['long-form', 'ad creative', 'paid spend'],
  },
  signature: {
    slug: 'signature',
    label: 'Signature',
    blurb: 'Higher cadence, broader format mix, full short-form coverage.',
    inclusions: {
      edited_video:
        'Vertical short-form edits, captions, music, two rounds of revisions.',
      ugc_video:
        'Original creator-style shorts on a weekly cadence.',
      static_graphic:
        'Single-frame social posts in batched delivery.',
    },
    outOfScope: ['long-form', 'ad creative', 'paid spend'],
  },
  enterprise: {
    slug: 'enterprise',
    label: 'Enterprise',
    blurb: 'Custom-scoped production agreement, see your contract for specifics.',
    inclusions: {
      edited_video:
        'Per-contract edited-video allotment with bespoke turnaround terms.',
      ugc_video:
        'Per-contract UGC cadence and creator network access.',
      static_graphic:
        'Per-contract static-graphic allotment, batched delivery.',
    },
    outOfScope: ['anything outside the signed scope of work'],
  },
};

/**
 * Pick a tier label based on the combined monthly allowances. Heuristic:
 *
 *   - 0 active types               → starter (likely an unprovisioned account)
 *   - <= 10 total/month            → starter
 *   - <= 25 total/month            → growth
 *   - <= 60 total/month            → signature
 *   - > 60 total/month             → enterprise
 *
 * Phase D replaces this with a column read on `clients.package_tier_slug`.
 * The fallback is intentional: a brand new client with zero allowances
 * still gets a non-empty scope panel (starter blurb) instead of a blank.
 */
export function inferScopeTier(balances: DeliverableBalance[]): ScopeTier {
  const total = balances.reduce(
    (acc, b) => acc + (b.hasRow ? b.monthlyAllowance : 0),
    0,
  );
  if (total === 0) return TIERS.starter;
  if (total <= 10) return TIERS.starter;
  if (total <= 25) return TIERS.growth;
  if (total <= 60) return TIERS.signature;
  return TIERS.enterprise;
}

export function scopeTierBySlug(slug: ScopeTierSlug): ScopeTier {
  return TIERS[slug];
}
