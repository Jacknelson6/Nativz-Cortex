/**
 * getTierCatalog — load the package_tiers catalog for an agency, joined
 * with their allotments and labelled per deliverable type.
 *
 * Single read used by:
 *   • GET /api/deliverables/[clientId]/tiers (admin tier picker)
 *   • Future server-rendered tier comparison surfaces
 *
 * The shape mirrors `TierCardData` in `components/deliverables/tier-card.tsx`
 * so the picker can spread the row directly into <TierCard />.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgencyBrand } from '@/lib/agency/detect';
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
  stripe_price_id: string;
  sort_order: number;
  is_best_value: boolean;
  scope_in: string;
  scope_out: string;
}

interface PackageTierAllotmentRow {
  package_tier_id: string;
  monthly_count: number;
  deliverable_type: { slug: string; sort_order: number } | null;
}

export async function getTierCatalog(
  admin: SupabaseClient,
  agency: AgencyBrand,
): Promise<TierCardData[]> {
  const { data: tiers, error: tiersErr } = await admin
    .from('package_tiers')
    .select(
      'id, slug, display_name, blurb, price_cents, monthly_term_minimum_months, stripe_price_id, sort_order, is_best_value, scope_in, scope_out',
    )
    .eq('agency', agency)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .returns<PackageTierRow[]>();
  if (tiersErr) {
    throw new Error(`Tier catalog read failed: ${tiersErr.message}`);
  }
  if (!tiers || tiers.length === 0) return [];

  const tierIds = tiers.map((t) => t.id);
  const { data: allots, error: allotsErr } = await admin
    .from('package_tier_allotments')
    .select(
      'package_tier_id, monthly_count, deliverable_type:deliverable_types(slug, sort_order)',
    )
    .in('package_tier_id', tierIds)
    .returns<PackageTierAllotmentRow[]>();
  if (allotsErr) {
    throw new Error(`Tier allotments read failed: ${allotsErr.message}`);
  }

  const allotsByTier = new Map<string, PackageTierAllotmentRow[]>();
  for (const a of allots ?? []) {
    const arr = allotsByTier.get(a.package_tier_id) ?? [];
    arr.push(a);
    allotsByTier.set(a.package_tier_id, arr);
  }

  return tiers.map<TierCardData>((t) => {
    const rows = (allotsByTier.get(t.id) ?? [])
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
      id: t.id,
      slug: t.slug,
      displayName: t.display_name,
      blurb: t.blurb,
      priceCents: t.price_cents,
      scopeIn: t.scope_in,
      scopeOut: t.scope_out,
      isBestValue: t.is_best_value,
      monthlyTermMinimumMonths: t.monthly_term_minimum_months,
      allotments: rows,
    };
  });
}
