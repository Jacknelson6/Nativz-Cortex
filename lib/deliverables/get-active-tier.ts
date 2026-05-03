/**
 * getActiveTier — resolve the client's currently-assigned package_tier into
 * a `TierCardData` so /deliverables can render the real card instead of the
 * inferred `ScopePanel`.
 *
 * Returns null when:
 *   - The client has no balance rows yet (unprovisioned account), OR
 *   - None of the existing balance rows reference a `package_tier_id`
 *     (legacy free-form admin override)
 *
 * Picks the most-common tier id when a client has multiple types pointing
 * at different tiers (a tolerable mid-migration state). The page logs a
 * warning when this happens so admins can re-run the tier picker to
 * straighten it out.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TierCardData } from '@/components/deliverables/tier-card';
import { deliverableCopy } from './copy';
import type { DeliverableTypeSlug } from '@/lib/credits/types';

interface PackageTierRow {
  id: string;
  slug: string;
  display_name: string;
  blurb: string;
  price_cents: number;
  monthly_term_minimum_months: number;
  sort_order: number;
  is_best_value: boolean;
  scope_in: string;
  scope_out: string;
}

interface AllotmentJoin {
  monthly_count: number;
  deliverable_type: { slug: string; sort_order: number } | null;
}

export interface GetActiveTierResult {
  tier: TierCardData | null;
  /** TRUE when balance rows reference more than one tier (legacy mismatch). */
  mixedTiers: boolean;
}

export async function getActiveTier(
  admin: SupabaseClient,
  clientId: string,
): Promise<GetActiveTierResult> {
  const { data: rows } = await admin
    .from('client_credit_balances')
    .select('package_tier_id')
    .eq('client_id', clientId)
    .returns<Array<{ package_tier_id: string | null }>>();

  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    if (!r.package_tier_id) continue;
    counts.set(r.package_tier_id, (counts.get(r.package_tier_id) ?? 0) + 1);
  }
  if (counts.size === 0) return { tier: null, mixedTiers: false };

  let tierId: string | null = null;
  let bestCount = 0;
  for (const [id, n] of counts) {
    if (n > bestCount) {
      tierId = id;
      bestCount = n;
    }
  }
  if (!tierId) return { tier: null, mixedTiers: false };

  const [{ data: tier }, { data: allots }] = await Promise.all([
    admin
      .from('package_tiers')
      .select(
        'id, slug, display_name, blurb, price_cents, monthly_term_minimum_months, sort_order, is_best_value, scope_in, scope_out',
      )
      .eq('id', tierId)
      .maybeSingle<PackageTierRow>(),
    admin
      .from('package_tier_allotments')
      .select(
        'monthly_count, deliverable_type:deliverable_types(slug, sort_order)',
      )
      .eq('package_tier_id', tierId)
      .returns<AllotmentJoin[]>(),
  ]);

  if (!tier) return { tier: null, mixedTiers: counts.size > 1 };

  const allotments = (allots ?? [])
    .filter((a) => a.deliverable_type?.slug)
    .sort(
      (a, b) =>
        (a.deliverable_type?.sort_order ?? 0) -
        (b.deliverable_type?.sort_order ?? 0),
    )
    .map((a) => {
      const slug = a.deliverable_type!.slug as DeliverableTypeSlug;
      return {
        deliverableTypeSlug: slug,
        label: deliverableCopy(slug).shortLabel,
        monthlyCount: a.monthly_count,
      };
    });

  return {
    tier: {
      id: tier.id,
      slug: tier.slug,
      displayName: tier.display_name,
      blurb: tier.blurb,
      priceCents: tier.price_cents,
      monthlyTermMinimumMonths: tier.monthly_term_minimum_months,
      isBestValue: tier.is_best_value,
      scopeIn: tier.scope_in,
      scopeOut: tier.scope_out,
      allotments,
    },
    mixedTiers: counts.size > 1,
  };
}
