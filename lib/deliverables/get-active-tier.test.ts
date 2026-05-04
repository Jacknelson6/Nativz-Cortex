import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveTier } from './get-active-tier';

/**
 * Active-tier resolution under test.
 *
 * Shape: read `client_credit_balances` for the client, count distinct
 * package_tier_id values, pick the most-common one (legacy mid-migration
 * mitigation), then load the `package_tiers` row and its allotments.
 *
 * Expected return shapes:
 *   - No balance rows yet                  -> { tier: null, mixedTiers: false }
 *   - All package_tier_id values are null  -> { tier: null, mixedTiers: false }
 *   - One tier referenced                  -> tier populated, mixedTiers: false
 *   - Multiple tiers referenced            -> tier = most common, mixedTiers: true
 *   - Most-common tier row missing in DB   -> { tier: null, mixedTiers: ? }
 */

interface BalanceRow {
  package_tier_id: string | null;
}

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
  monthly_count: number;
  deliverable_type: { slug: string; sort_order: number } | null;
}

interface MockState {
  balances: BalanceRow[];
  tiers: TierRow[];
  allotments: AllotmentRow[];
}

function makeAdmin(state: MockState): SupabaseClient {
  const fromMock = vi.fn((table: string) => {
    if (table === 'client_credit_balances') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: state.balances, error: null })),
      };
      return builder;
    }
    if (table === 'package_tiers') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({
          data: state.tiers[0] ?? null,
          error: null,
        })),
      };
      return builder;
    }
    if (table === 'package_tier_allotments') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        returns: vi.fn(async () => ({
          data: state.allotments,
          error: null,
        })),
      };
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from: fromMock } as unknown as SupabaseClient;
}

const SIGNATURE_TIER: TierRow = {
  id: 'tier-sig',
  slug: 'signature',
  display_name: 'Signature',
  blurb: 'blurb',
  price_cents: 500000,
  monthly_term_minimum_months: 6,
  sort_order: 30,
  is_best_value: true,
  scope_in: 'in',
  scope_out: 'out',
};

describe('getActiveTier', () => {
  it('returns null with mixedTiers=false when the client has no balance rows', async () => {
    const admin = makeAdmin({ balances: [], tiers: [], allotments: [] });
    expect(await getActiveTier(admin, 'client-1')).toEqual({
      tier: null,
      mixedTiers: false,
    });
  });

  it('returns null when every balance row has null package_tier_id (legacy override)', async () => {
    const admin = makeAdmin({
      balances: [{ package_tier_id: null }, { package_tier_id: null }],
      tiers: [],
      allotments: [],
    });
    expect(await getActiveTier(admin, 'client-1')).toEqual({
      tier: null,
      mixedTiers: false,
    });
  });

  it('returns the matching tier when all balance rows agree on a single tier', async () => {
    const admin = makeAdmin({
      balances: [
        { package_tier_id: 'tier-sig' },
        { package_tier_id: 'tier-sig' },
        { package_tier_id: 'tier-sig' },
      ],
      tiers: [SIGNATURE_TIER],
      allotments: [
        {
          monthly_count: 12,
          deliverable_type: { slug: 'edited_video', sort_order: 10 },
        },
        {
          monthly_count: 4,
          deliverable_type: { slug: 'ugc_video', sort_order: 20 },
        },
      ],
    });
    const result = await getActiveTier(admin, 'client-1');
    expect(result.mixedTiers).toBe(false);
    expect(result.tier).not.toBeNull();
    expect(result.tier?.slug).toBe('signature');
    expect(result.tier?.allotments).toEqual([
      {
        deliverableTypeSlug: 'edited_video',
        label: 'Edited video',
        monthlyCount: 12,
      },
      {
        deliverableTypeSlug: 'ugc_video',
        label: 'UGC video',
        monthlyCount: 4,
      },
    ]);
  });

  it('flags mixedTiers=true when balance rows reference more than one tier', async () => {
    const admin = makeAdmin({
      // Two for tier-sig, one for tier-other -> tier-sig wins, mixedTiers true
      balances: [
        { package_tier_id: 'tier-sig' },
        { package_tier_id: 'tier-sig' },
        { package_tier_id: 'tier-other' },
      ],
      tiers: [SIGNATURE_TIER],
      allotments: [],
    });
    const result = await getActiveTier(admin, 'client-1');
    expect(result.mixedTiers).toBe(true);
    expect(result.tier?.id).toBe('tier-sig');
  });

  it('sorts allotments by deliverable_type.sort_order, not insertion order', async () => {
    const admin = makeAdmin({
      balances: [{ package_tier_id: 'tier-sig' }],
      tiers: [SIGNATURE_TIER],
      // Insertion order is ugc_video then edited_video, but sort_order
      // says edited_video (10) comes before ugc_video (20).
      allotments: [
        {
          monthly_count: 4,
          deliverable_type: { slug: 'ugc_video', sort_order: 20 },
        },
        {
          monthly_count: 12,
          deliverable_type: { slug: 'edited_video', sort_order: 10 },
        },
      ],
    });
    const result = await getActiveTier(admin, 'client-1');
    expect(result.tier?.allotments.map((a) => a.deliverableTypeSlug)).toEqual([
      'edited_video',
      'ugc_video',
    ]);
  });

  it('drops allotment rows whose deliverable_type join is null', async () => {
    const admin = makeAdmin({
      balances: [{ package_tier_id: 'tier-sig' }],
      tiers: [SIGNATURE_TIER],
      allotments: [
        {
          monthly_count: 12,
          deliverable_type: { slug: 'edited_video', sort_order: 10 },
        },
        // Orphaned allotment row, should be filtered out
        { monthly_count: 99, deliverable_type: null },
      ],
    });
    const result = await getActiveTier(admin, 'client-1');
    expect(result.tier?.allotments).toHaveLength(1);
    expect(result.tier?.allotments[0]?.deliverableTypeSlug).toBe('edited_video');
  });

  it('returns null tier but preserves mixedTiers when the tier row is missing', async () => {
    const admin = makeAdmin({
      balances: [
        { package_tier_id: 'tier-sig' },
        { package_tier_id: 'tier-other' },
      ],
      tiers: [], // tier row not found in DB
      allotments: [],
    });
    const result = await getActiveTier(admin, 'client-1');
    expect(result.tier).toBeNull();
    expect(result.mixedTiers).toBe(true);
  });
});
