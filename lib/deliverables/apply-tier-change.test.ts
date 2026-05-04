import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyTierChange } from './apply-tier-change';

/**
 * applyTierChange, idempotent tier assignment for a client.
 *
 * Contract under test:
 *   1. Throws when the new tier doesn't resolve.
 *   2. Per allotment: prorates (newCount - oldCount) by remaining/total
 *      days in the current period, half-up rounded, symmetric across sign.
 *   3. Skips ledger writes when a prior credit_transactions row exists for
 *      the same idempotency_key (replay safety SELECT short-circuit).
 *   4. Catches Postgres 23505 from the ledger insert as alreadyApplied=true
 *      (the unique-index race fallback).
 *   5. Updates an existing balance row in place; inserts a fresh row with
 *      the falling-back period window when no row exists.
 *   6. Orphan cleanup: balance rows whose deliverable_type isn't in the new
 *      tier get monthly_allowance=0, auto_grant_enabled=false, and a
 *      symmetric prorated wind-down debit.
 */

interface TierRow {
  id: string;
  slug: string;
  display_name: string;
  agency: string;
}

interface AllotmentRow {
  deliverable_type_id: string;
  monthly_count: number;
  rollover_policy: 'none' | 'cap' | 'unlimited';
  rollover_cap: number | null;
}

interface BalanceRow {
  deliverable_type_id: string;
  monthly_allowance: number;
  current_balance: number;
  package_tier_id: string | null;
  period_started_at: string;
  period_ends_at: string;
  next_reset_at: string;
}

interface DeliverableTypeRow {
  id: string;
  slug: string;
}

interface AdminOpts {
  tier?: TierRow | null;
  tierError?: { message: string };
  allotments?: AllotmentRow[];
  balances?: BalanceRow[];
  types?: DeliverableTypeRow[];
  /** When set, the next credit_transactions select-by-idempotency_key returns these rows. */
  priorTxByKey?: Map<string, Array<{ id: string }>>;
  /** When set, the credit_transactions.insert returns this error (e.g. 23505). */
  txInsertError?: { code?: string; message: string } | null;
}

interface Captured {
  balanceUpdates: Array<{
    where: { client_id?: string; deliverable_type_id?: string };
    set: Record<string, unknown>;
  }>;
  balanceInserts: Array<Record<string, unknown>>;
  txInserts: Array<Record<string, unknown>>;
  idempotencyKeyLookups: string[];
}

function makeAdmin(opts: AdminOpts): {
  admin: SupabaseClient;
  captured: Captured;
} {
  const captured: Captured = {
    balanceUpdates: [],
    balanceInserts: [],
    txInserts: [],
    idempotencyKeyLookups: [],
  };

  const fromMock = vi.fn((table: string) => {
    if (table === 'package_tiers') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(async () => ({
          data: opts.tier ?? null,
          error: opts.tierError ?? (opts.tier ? null : { message: 'no row' }),
        })),
      };
      return builder;
    }
    if (table === 'package_tier_allotments') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        returns: vi.fn(async () => ({
          data: opts.allotments ?? [],
          error: null,
        })),
      };
      return builder;
    }
    if (table === 'client_credit_balances') {
      let pendingFilter: { client_id?: string; deliverable_type_id?: string } = {};
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: string) => {
          pendingFilter = { ...pendingFilter, [col]: val };
          return builder;
        }),
        returns: vi.fn(async () => ({
          data: opts.balances ?? [],
          error: null,
        })),
        update: vi.fn((set: Record<string, unknown>) => {
          pendingFilter = {};
          const updateBuilder = {
            eq: vi.fn((col: string, val: string) => {
              pendingFilter = { ...pendingFilter, [col]: val };
              return updateBuilder;
            }),
            then: (
              resolve: (v: { error: null }) => unknown,
              reject?: (e: unknown) => unknown,
            ) => {
              try {
                captured.balanceUpdates.push({ where: pendingFilter, set });
                return Promise.resolve({ error: null }).then(resolve, reject);
              } catch (e) {
                return Promise.reject(e);
              }
            },
          };
          return updateBuilder;
        }),
        insert: vi.fn(async (row: Record<string, unknown>) => {
          captured.balanceInserts.push(row);
          return { error: null };
        }),
      };
      return builder;
    }
    if (table === 'deliverable_types') {
      const builder = {
        select: vi.fn(() => builder),
        returns: vi.fn(async () => ({
          data: opts.types ?? [],
          error: null,
        })),
      };
      return builder;
    }
    if (table === 'credit_transactions') {
      let pendingKey: string | null = null;
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: string) => {
          if (col === 'idempotency_key') pendingKey = val;
          return builder;
        }),
        limit: vi.fn(async () => {
          if (pendingKey) {
            captured.idempotencyKeyLookups.push(pendingKey);
            const prior = opts.priorTxByKey?.get(pendingKey);
            return { data: prior ?? [], error: null };
          }
          return { data: [], error: null };
        }),
        insert: vi.fn(async (row: Record<string, unknown>) => {
          captured.txInserts.push(row);
          return { error: opts.txInsertError ?? null };
        }),
      };
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    admin: { from: fromMock } as unknown as SupabaseClient,
    captured,
  };
}

const TIER: TierRow = {
  id: 'tier-studio',
  slug: 'studio',
  display_name: 'Studio',
  agency: 'nativz',
};

const TYPES: DeliverableTypeRow[] = [
  { id: 'type-edited', slug: 'edited_video' },
  { id: 'type-ugc', slug: 'ugc_video' },
  { id: 'type-static', slug: 'static_graphic' },
];

function balance(overrides: Partial<BalanceRow>): BalanceRow {
  return {
    deliverable_type_id: 'type-edited',
    monthly_allowance: 4,
    current_balance: 4,
    package_tier_id: 'tier-old',
    period_started_at: '2026-04-01T00:00:00Z',
    period_ends_at: '2026-05-01T00:00:00Z',
    next_reset_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('applyTierChange', () => {
  it('throws when the new tier does not resolve', async () => {
    const { admin } = makeAdmin({
      tier: null,
      tierError: { message: 'row not found' },
    });
    await expect(
      applyTierChange(admin, 'client-1', 'tier-missing'),
    ).rejects.toThrow(/Tier tier-missing not found: row not found/);
  });

  it('updates an existing balance row in place and writes a prorated adjust', async () => {
    // Period 2026-04-01 → 2026-05-01 (30d). Now is 2026-04-19 → 12d remaining.
    // Old=4, new=10. Delta = (10-4)*(12/30) = 6 * 0.4 = 2.4 → round to 2.
    const { admin, captured } = makeAdmin({
      tier: TIER,
      types: TYPES,
      allotments: [
        {
          deliverable_type_id: 'type-edited',
          monthly_count: 10,
          rollover_policy: 'cap',
          rollover_cap: 5,
        },
      ],
      balances: [balance({ monthly_allowance: 4, current_balance: 4 })],
    });

    const result = await applyTierChange(admin, 'client-1', 'tier-studio', {
      now: new Date('2026-04-19T00:00:00Z'),
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      deliverableTypeId: 'type-edited',
      deliverableTypeSlug: 'edited_video',
      oldMonthlyCount: 4,
      newMonthlyCount: 10,
      proratedDelta: 2,
      rowCreated: false,
      alreadyApplied: false,
    });

    expect(captured.balanceUpdates).toHaveLength(1);
    expect(captured.balanceUpdates[0].set).toMatchObject({
      package_tier_id: 'tier-studio',
      monthly_allowance: 10,
      rollover_policy: 'cap',
      rollover_cap: 5,
      current_balance: 6, // 4 + 2
    });
    expect(captured.txInserts).toHaveLength(1);
    expect(captured.txInserts[0]).toMatchObject({
      kind: 'adjust',
      delta: 2,
      idempotency_key:
        'tier-change:client-1:tier-studio:2026-04-01T00:00:00Z:type-edited',
    });
  });

  it('rounds half-up symmetrically across positive and negative deltas', async () => {
    // 30-day period, 15d remaining (50%). Delta=+5: 2.5 → 3. Delta=-5: -3.
    const positive = makeAdmin({
      tier: TIER,
      types: TYPES,
      allotments: [
        {
          deliverable_type_id: 'type-edited',
          monthly_count: 10,
          rollover_policy: 'none',
          rollover_cap: null,
        },
      ],
      balances: [balance({ monthly_allowance: 5, current_balance: 5 })],
    });
    const posResult = await applyTierChange(positive.admin, 'client-1', 'tier-studio', {
      now: new Date('2026-04-16T00:00:00Z'),
    });
    expect(posResult.rows[0].proratedDelta).toBe(3);

    const negative = makeAdmin({
      tier: TIER,
      types: TYPES,
      allotments: [
        {
          deliverable_type_id: 'type-edited',
          monthly_count: 5,
          rollover_policy: 'none',
          rollover_cap: null,
        },
      ],
      balances: [balance({ monthly_allowance: 10, current_balance: 10 })],
    });
    const negResult = await applyTierChange(negative.admin, 'client-1', 'tier-studio', {
      now: new Date('2026-04-16T00:00:00Z'),
    });
    expect(negResult.rows[0].proratedDelta).toBe(-3);
  });

  it('returns proratedDelta=0 when the period has already ended (no ledger write)', async () => {
    const { admin, captured } = makeAdmin({
      tier: TIER,
      types: TYPES,
      allotments: [
        {
          deliverable_type_id: 'type-edited',
          monthly_count: 10,
          rollover_policy: 'none',
          rollover_cap: null,
        },
      ],
      balances: [balance({ monthly_allowance: 4, current_balance: 4 })],
    });
    // now is past period_ends_at
    const result = await applyTierChange(admin, 'client-1', 'tier-studio', {
      now: new Date('2026-05-15T00:00:00Z'),
    });
    expect(result.rows[0].proratedDelta).toBe(0);
    expect(captured.txInserts).toHaveLength(0);
    // Balance row still updated to reflect the new tier metadata.
    expect(captured.balanceUpdates).toHaveLength(1);
    expect(captured.balanceUpdates[0].set).toMatchObject({
      package_tier_id: 'tier-studio',
      monthly_allowance: 10,
      current_balance: 4, // unchanged (delta=0)
    });
  });

  it('inserts a fresh balance row when the type has no existing balance, falling back to a 30-day window', async () => {
    const { admin, captured } = makeAdmin({
      tier: TIER,
      types: TYPES,
      allotments: [
        {
          deliverable_type_id: 'type-static',
          monthly_count: 6,
          rollover_policy: 'none',
          rollover_cap: null,
        },
      ],
      balances: [], // client has no rows at all
    });
    const result = await applyTierChange(admin, 'client-1', 'tier-studio', {
      now: new Date('2026-04-01T00:00:00Z'),
    });
    expect(result.rows[0]).toMatchObject({
      deliverableTypeId: 'type-static',
      oldMonthlyCount: null,
      newMonthlyCount: 6,
      rowCreated: true,
      alreadyApplied: false,
    });
    expect(captured.balanceInserts).toHaveLength(1);
    expect(captured.balanceInserts[0]).toMatchObject({
      client_id: 'client-1',
      deliverable_type_id: 'type-static',
      package_tier_id: 'tier-studio',
      monthly_allowance: 6,
      auto_grant_enabled: true,
      // current_balance = proratedDelta when positive, else 0
      current_balance: 6,
    });
  });

  it('skips both balance update and ledger insert when a prior idempotency_key row exists', async () => {
    const idemKey =
      'tier-change:client-1:tier-studio:2026-04-01T00:00:00Z:type-edited';
    const { admin, captured } = makeAdmin({
      tier: TIER,
      types: TYPES,
      allotments: [
        {
          deliverable_type_id: 'type-edited',
          monthly_count: 10,
          rollover_policy: 'none',
          rollover_cap: null,
        },
      ],
      balances: [balance({ monthly_allowance: 4, current_balance: 4 })],
      priorTxByKey: new Map([[idemKey, [{ id: 'prior-tx' }]]]),
    });
    const result = await applyTierChange(admin, 'client-1', 'tier-studio', {
      now: new Date('2026-04-19T00:00:00Z'),
    });
    expect(result.rows[0].alreadyApplied).toBe(true);
    expect(captured.balanceUpdates).toHaveLength(0);
    expect(captured.txInserts).toHaveLength(0);
    expect(captured.idempotencyKeyLookups).toContain(idemKey);
  });

  it('catches Postgres 23505 from the ledger insert and reports alreadyApplied=true', async () => {
    const { admin, captured } = makeAdmin({
      tier: TIER,
      types: TYPES,
      allotments: [
        {
          deliverable_type_id: 'type-edited',
          monthly_count: 10,
          rollover_policy: 'none',
          rollover_cap: null,
        },
      ],
      balances: [balance({ monthly_allowance: 4, current_balance: 4 })],
      txInsertError: { code: '23505', message: 'duplicate key' },
    });
    const result = await applyTierChange(admin, 'client-1', 'tier-studio', {
      now: new Date('2026-04-19T00:00:00Z'),
    });
    expect(result.rows[0].alreadyApplied).toBe(true);
    expect(captured.balanceUpdates).toHaveLength(1);
    expect(captured.txInserts).toHaveLength(1);
  });

  it('rethrows non-23505 ledger insert errors as a descriptive failure', async () => {
    const { admin } = makeAdmin({
      tier: TIER,
      types: TYPES,
      allotments: [
        {
          deliverable_type_id: 'type-edited',
          monthly_count: 10,
          rollover_policy: 'none',
          rollover_cap: null,
        },
      ],
      balances: [balance({ monthly_allowance: 4, current_balance: 4 })],
      txInsertError: { code: '42P01', message: 'relation missing' },
    });
    await expect(
      applyTierChange(admin, 'client-1', 'tier-studio', {
        now: new Date('2026-04-19T00:00:00Z'),
      }),
    ).rejects.toThrow(/Tier-change ledger write failed: relation missing/);
  });

  it('cleans up orphaned balance rows on downgrade with a prorated wind-down', async () => {
    // Old tier had ugc_video; new tier (Studio) only covers edited_video.
    // Period 2026-04-01 → 2026-05-01, now 2026-04-16 (50%). Old=8, new=0.
    // Delta = (0-8)*0.5 = -4.
    const { admin, captured } = makeAdmin({
      tier: TIER,
      types: TYPES,
      allotments: [
        {
          deliverable_type_id: 'type-edited',
          monthly_count: 10,
          rollover_policy: 'none',
          rollover_cap: null,
        },
      ],
      balances: [
        balance({ monthly_allowance: 4, current_balance: 4 }),
        balance({
          deliverable_type_id: 'type-ugc',
          monthly_allowance: 8,
          current_balance: 8,
        }),
      ],
    });
    const result = await applyTierChange(admin, 'client-1', 'tier-studio', {
      now: new Date('2026-04-16T00:00:00Z'),
    });

    const orphanRow = result.rows.find((r) => r.deliverableTypeId === 'type-ugc');
    expect(orphanRow).toMatchObject({
      deliverableTypeSlug: 'ugc_video',
      oldMonthlyCount: 8,
      newMonthlyCount: 0,
      proratedDelta: -4,
      rowCreated: false,
      alreadyApplied: false,
    });

    const orphanUpdate = captured.balanceUpdates.find(
      (u) => u.where.deliverable_type_id === 'type-ugc',
    );
    expect(orphanUpdate?.set).toMatchObject({
      package_tier_id: 'tier-studio',
      monthly_allowance: 0,
      rollover_policy: 'none',
      rollover_cap: null,
      auto_grant_enabled: false,
      current_balance: 4, // 8 + (-4)
    });

    const orphanTx = captured.txInserts.find(
      (t) => t.deliverable_type_id === 'type-ugc',
    );
    expect(orphanTx).toMatchObject({
      kind: 'adjust',
      delta: -4,
    });
    expect((orphanTx?.note as string) ?? '').toContain('no longer covered');
  });

  it('returns the new tier metadata in the result envelope', async () => {
    const { admin } = makeAdmin({
      tier: TIER,
      types: TYPES,
      allotments: [],
      balances: [],
    });
    const result = await applyTierChange(admin, 'client-1', 'tier-studio');
    expect(result).toMatchObject({
      clientId: 'client-1',
      newTierId: 'tier-studio',
      newTierSlug: 'studio',
      newTierDisplayName: 'Studio',
      rows: [],
    });
  });

  it('writes the actorUserId onto every adjust row when supplied', async () => {
    const { admin, captured } = makeAdmin({
      tier: TIER,
      types: TYPES,
      allotments: [
        {
          deliverable_type_id: 'type-edited',
          monthly_count: 10,
          rollover_policy: 'none',
          rollover_cap: null,
        },
      ],
      balances: [balance({ monthly_allowance: 4, current_balance: 4 })],
    });
    await applyTierChange(admin, 'client-1', 'tier-studio', {
      now: new Date('2026-04-19T00:00:00Z'),
      actorUserId: 'user-jack',
    });
    expect(captured.txInserts[0]).toMatchObject({ actor_user_id: 'user-jack' });
  });
});
