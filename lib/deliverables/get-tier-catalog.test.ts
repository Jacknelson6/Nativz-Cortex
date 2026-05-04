import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTierCatalog } from './get-tier-catalog';

/**
 * Tier catalog read used by the admin tier picker. Two table reads:
 *   1. package_tiers, ordered by sort_order ascending, scoped by agency
 *      and is_active.
 *   2. package_tier_allotments joined to deliverable_types for the slug
 *      and sort_order of each row.
 *
 * The function maps the joined result into TierCardData shape so the picker
 * can spread the row directly into <TierCard />.
 */

interface TierRow {
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

interface AllotmentRow {
  package_tier_id: string;
  monthly_count: number;
  deliverable_type: { slug: string; sort_order: number } | null;
}

function makeAdmin(opts: {
  tiers: TierRow[];
  tiersError?: { message: string };
  allotments: AllotmentRow[];
  allotmentsError?: { message: string };
}): SupabaseClient {
  const fromMock = vi.fn((table: string) => {
    if (table === 'package_tiers') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        returns: vi.fn(async () => ({
          data: opts.tiersError ? null : opts.tiers,
          error: opts.tiersError ?? null,
        })),
      };
      return builder;
    }
    if (table === 'package_tier_allotments') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => builder),
        returns: vi.fn(async () => ({
          data: opts.allotmentsError ? null : opts.allotments,
          error: opts.allotmentsError ?? null,
        })),
      };
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from: fromMock } as unknown as SupabaseClient;
}

const STARTER: TierRow = {
  id: 'tier-starter',
  slug: 'starter',
  display_name: 'Starter',
  blurb: 'starter blurb',
  price_cents: 100000,
  monthly_term_minimum_months: 3,
  sort_order: 10,
  is_best_value: false,
  scope_in: 'in-s',
  scope_out: 'out-s',
};

const GROWTH: TierRow = {
  id: 'tier-growth',
  slug: 'growth',
  display_name: 'Growth',
  blurb: 'growth blurb',
  price_cents: 250000,
  monthly_term_minimum_months: 6,
  sort_order: 20,
  is_best_value: true,
  scope_in: 'in-g',
  scope_out: 'out-g',
};

describe('getTierCatalog', () => {
  it('returns an empty array when no tiers exist for the agency', async () => {
    const admin = makeAdmin({ tiers: [], allotments: [] });
    expect(await getTierCatalog(admin, 'nativz')).toEqual([]);
  });

  it('throws a descriptive error when the tier read fails', async () => {
    const admin = makeAdmin({
      tiers: [],
      tiersError: { message: 'rls denied' },
      allotments: [],
    });
    await expect(getTierCatalog(admin, 'nativz')).rejects.toThrow(
      /Tier catalog read failed: rls denied/,
    );
  });

  it('throws a descriptive error when the allotments read fails', async () => {
    const admin = makeAdmin({
      tiers: [STARTER],
      allotments: [],
      allotmentsError: { message: 'connection lost' },
    });
    await expect(getTierCatalog(admin, 'nativz')).rejects.toThrow(
      /Tier allotments read failed: connection lost/,
    );
  });

  it('maps each tier row into TierCardData shape', async () => {
    const admin = makeAdmin({
      tiers: [STARTER],
      allotments: [
        {
          package_tier_id: 'tier-starter',
          monthly_count: 4,
          deliverable_type: { slug: 'edited_video', sort_order: 10 },
        },
      ],
    });
    const [card] = await getTierCatalog(admin, 'nativz');
    expect(card).toEqual({
      id: 'tier-starter',
      slug: 'starter',
      displayName: 'Starter',
      blurb: 'starter blurb',
      priceCents: 100000,
      scopeIn: 'in-s',
      scopeOut: 'out-s',
      isBestValue: false,
      monthlyTermMinimumMonths: 3,
      allotments: [
        {
          deliverableTypeSlug: 'edited_video',
          label: 'Edited video',
          monthlyCount: 4,
        },
      ],
    });
  });

  it('groups allotments by package_tier_id without leaking across tiers', async () => {
    const admin = makeAdmin({
      tiers: [STARTER, GROWTH],
      allotments: [
        {
          package_tier_id: 'tier-starter',
          monthly_count: 4,
          deliverable_type: { slug: 'edited_video', sort_order: 10 },
        },
        {
          package_tier_id: 'tier-growth',
          monthly_count: 12,
          deliverable_type: { slug: 'edited_video', sort_order: 10 },
        },
        {
          package_tier_id: 'tier-growth',
          monthly_count: 4,
          deliverable_type: { slug: 'ugc_video', sort_order: 20 },
        },
      ],
    });
    const cards = await getTierCatalog(admin, 'nativz');
    expect(cards.find((c) => c.slug === 'starter')?.allotments).toEqual([
      {
        deliverableTypeSlug: 'edited_video',
        label: 'Edited video',
        monthlyCount: 4,
      },
    ]);
    expect(cards.find((c) => c.slug === 'growth')?.allotments).toHaveLength(2);
  });

  it('sorts each tier\'s allotments by deliverable_type.sort_order', async () => {
    const admin = makeAdmin({
      tiers: [GROWTH],
      // Insertion order: ugc_video first, edited_video second.
      // Expected order: edited_video first (sort_order 10), ugc_video second (20).
      allotments: [
        {
          package_tier_id: 'tier-growth',
          monthly_count: 4,
          deliverable_type: { slug: 'ugc_video', sort_order: 20 },
        },
        {
          package_tier_id: 'tier-growth',
          monthly_count: 12,
          deliverable_type: { slug: 'edited_video', sort_order: 10 },
        },
      ],
    });
    const [growth] = await getTierCatalog(admin, 'nativz');
    expect(growth?.allotments.map((a) => a.deliverableTypeSlug)).toEqual([
      'edited_video',
      'ugc_video',
    ]);
  });

  it('drops allotment rows whose deliverable_type join is null', async () => {
    const admin = makeAdmin({
      tiers: [STARTER],
      allotments: [
        {
          package_tier_id: 'tier-starter',
          monthly_count: 4,
          deliverable_type: { slug: 'edited_video', sort_order: 10 },
        },
        {
          package_tier_id: 'tier-starter',
          monthly_count: 99,
          deliverable_type: null,
        },
      ],
    });
    const [starter] = await getTierCatalog(admin, 'nativz');
    expect(starter?.allotments).toHaveLength(1);
    expect(starter?.allotments[0]?.deliverableTypeSlug).toBe('edited_video');
  });

  it('returns tier rows in the order Supabase delivered them (caller has already ordered by sort_order)', async () => {
    // The function relies on .order('sort_order', ascending: true) on the
    // initial read, so it does not re-sort the parent array. This test
    // pins that contract: whatever order the rows arrive in, that's the
    // order they ship out in.
    const admin = makeAdmin({
      tiers: [STARTER, GROWTH],
      allotments: [],
    });
    const cards = await getTierCatalog(admin, 'nativz');
    expect(cards.map((c) => c.slug)).toEqual(['starter', 'growth']);
  });
});
