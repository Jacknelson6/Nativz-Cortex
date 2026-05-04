import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliverableTypeSlug } from '@/lib/credits/types';

interface CachedType {
  id: string;
  slug: DeliverableTypeSlug;
  display_name: string;
  sort_order: number;
  is_active: boolean;
}

const listDeliverableTypesMock = vi.fn(
  async (_admin: unknown): Promise<CachedType[]> => [],
);

vi.mock('./types-cache', () => ({
  listDeliverableTypes: listDeliverableTypesMock,
}));

const { getDeliverableBalances } = await import('./get-balances');

/**
 * getDeliverableBalances, per-client per-type balance loader.
 *
 * Contract under test:
 *   1. One entry per active deliverable type, in the order returned by
 *      listDeliverableTypes (the cache is the source of sort_order).
 *   2. Types with no matching client_credit_balances row become a
 *      `hasRow: false` placeholder with zeroed numeric fields and the
 *      DEFAULTS rolloverPolicy='none' / autoGrantEnabled=true.
 *   3. Types with a matching row carry the row's persisted values through
 *      verbatim, including null rollover_cap and paused_until.
 */

interface BalanceRow {
  deliverable_type_id: string;
  current_balance: number;
  monthly_allowance: number;
  rollover_policy: 'none' | 'cap' | 'unlimited';
  rollover_cap: number | null;
  auto_grant_enabled: boolean;
  paused_until: string | null;
  pause_reason: string | null;
  period_started_at: string;
  next_reset_at: string;
}

function makeAdmin(rows: BalanceRow[]): SupabaseClient {
  const fromMock = vi.fn((table: string) => {
    if (table !== 'client_credit_balances') {
      throw new Error(`unexpected table: ${table}`);
    }
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      returns: vi.fn(async () => ({ data: rows, error: null })),
    };
    return builder;
  });
  return { from: fromMock } as unknown as SupabaseClient;
}

const TYPES: CachedType[] = [
  {
    id: 'type-edited',
    slug: 'edited_video',
    display_name: 'Edited Video',
    sort_order: 10,
    is_active: true,
  },
  {
    id: 'type-ugc',
    slug: 'ugc_video',
    display_name: 'UGC Video',
    sort_order: 20,
    is_active: true,
  },
  {
    id: 'type-static',
    slug: 'static_graphic',
    display_name: 'Static Graphic',
    sort_order: 30,
    is_active: true,
  },
];

beforeEach(() => {
  listDeliverableTypesMock.mockReset();
  listDeliverableTypesMock.mockResolvedValue(TYPES);
});

describe('getDeliverableBalances', () => {
  it('returns one placeholder per active type when the client has no balance rows', async () => {
    const admin = makeAdmin([]);
    const balances = await getDeliverableBalances(admin, 'client-1');
    expect(balances).toHaveLength(3);
    expect(balances.every((b) => b.hasRow === false)).toBe(true);
    expect(balances.map((b) => b.deliverableTypeSlug)).toEqual([
      'edited_video',
      'ugc_video',
      'static_graphic',
    ]);
  });

  it('zeroes numeric fields and uses safe defaults on placeholders', async () => {
    const admin = makeAdmin([]);
    const [edited] = await getDeliverableBalances(admin, 'client-1');
    expect(edited).toEqual({
      deliverableTypeId: 'type-edited',
      deliverableTypeSlug: 'edited_video',
      displayName: 'Edited Video',
      sortOrder: 10,
      hasRow: false,
      currentBalance: 0,
      monthlyAllowance: 0,
      rolloverPolicy: 'none',
      rolloverCap: null,
      autoGrantEnabled: true,
      pausedUntil: null,
      pauseReason: null,
      periodStartedAt: null,
      nextResetAt: null,
    });
  });

  it('hydrates a real balance row verbatim with hasRow=true', async () => {
    const admin = makeAdmin([
      {
        deliverable_type_id: 'type-edited',
        current_balance: 7,
        monthly_allowance: 10,
        rollover_policy: 'cap',
        rollover_cap: 5,
        auto_grant_enabled: false,
        paused_until: '2026-06-01T00:00:00Z',
        pause_reason: 'client requested freeze',
        period_started_at: '2026-04-01T00:00:00Z',
        next_reset_at: '2026-05-01T00:00:00Z',
      },
    ]);
    const balances = await getDeliverableBalances(admin, 'client-1');
    const edited = balances.find((b) => b.deliverableTypeSlug === 'edited_video');
    expect(edited).toEqual({
      deliverableTypeId: 'type-edited',
      deliverableTypeSlug: 'edited_video',
      displayName: 'Edited Video',
      sortOrder: 10,
      hasRow: true,
      currentBalance: 7,
      monthlyAllowance: 10,
      rolloverPolicy: 'cap',
      rolloverCap: 5,
      autoGrantEnabled: false,
      pausedUntil: '2026-06-01T00:00:00Z',
      pauseReason: 'client requested freeze',
      periodStartedAt: '2026-04-01T00:00:00Z',
      nextResetAt: '2026-05-01T00:00:00Z',
    });
  });

  it('mixes real rows and placeholders so every active type is present', async () => {
    const admin = makeAdmin([
      {
        deliverable_type_id: 'type-edited',
        current_balance: 4,
        monthly_allowance: 8,
        rollover_policy: 'none',
        rollover_cap: null,
        auto_grant_enabled: true,
        paused_until: null,
        pause_reason: null,
        period_started_at: '2026-04-01T00:00:00Z',
        next_reset_at: '2026-05-01T00:00:00Z',
      },
    ]);
    const balances = await getDeliverableBalances(admin, 'client-1');
    expect(balances).toHaveLength(3);
    const edited = balances.find((b) => b.deliverableTypeSlug === 'edited_video');
    const ugc = balances.find((b) => b.deliverableTypeSlug === 'ugc_video');
    const stat = balances.find((b) => b.deliverableTypeSlug === 'static_graphic');
    expect(edited?.hasRow).toBe(true);
    expect(edited?.currentBalance).toBe(4);
    expect(ugc?.hasRow).toBe(false);
    expect(stat?.hasRow).toBe(false);
  });

  it('preserves the order from listDeliverableTypes (no internal re-sort)', async () => {
    // Insert types out-of-order, the function should not re-sort them.
    listDeliverableTypesMock.mockResolvedValue([
      TYPES[2], // static_graphic
      TYPES[0], // edited_video
      TYPES[1], // ugc_video
    ]);
    const admin = makeAdmin([]);
    const balances = await getDeliverableBalances(admin, 'client-1');
    expect(balances.map((b) => b.deliverableTypeSlug)).toEqual([
      'static_graphic',
      'edited_video',
      'ugc_video',
    ]);
  });

  it('ignores balance rows whose deliverable_type_id is not in the active types list', async () => {
    const admin = makeAdmin([
      {
        deliverable_type_id: 'type-edited',
        current_balance: 4,
        monthly_allowance: 8,
        rollover_policy: 'none',
        rollover_cap: null,
        auto_grant_enabled: true,
        paused_until: null,
        pause_reason: null,
        period_started_at: '2026-04-01T00:00:00Z',
        next_reset_at: '2026-05-01T00:00:00Z',
      },
      {
        // Stale row for a type that was deactivated, must not appear
        // as a fourth entry in the output.
        deliverable_type_id: 'type-retired',
        current_balance: 99,
        monthly_allowance: 99,
        rollover_policy: 'unlimited',
        rollover_cap: null,
        auto_grant_enabled: true,
        paused_until: null,
        pause_reason: null,
        period_started_at: '2026-04-01T00:00:00Z',
        next_reset_at: '2026-05-01T00:00:00Z',
      },
    ]);
    const balances = await getDeliverableBalances(admin, 'client-1');
    expect(balances).toHaveLength(3);
    expect(balances.map((b) => b.deliverableTypeSlug)).toEqual([
      'edited_video',
      'ugc_video',
      'static_graphic',
    ]);
    expect(balances.every((b) => b.deliverableTypeId !== 'type-retired')).toBe(true);
  });

  it('returns an empty array when there are no active deliverable types', async () => {
    listDeliverableTypesMock.mockResolvedValue([]);
    const admin = makeAdmin([]);
    expect(await getDeliverableBalances(admin, 'client-1')).toEqual([]);
  });

  it('treats a null balance read as no rows (every type becomes a placeholder)', async () => {
    const fromMock = vi.fn((table: string) => {
      if (table !== 'client_credit_balances') {
        throw new Error(`unexpected table: ${table}`);
      }
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: null, error: null })),
      };
      return builder;
    });
    const admin = { from: fromMock } as unknown as SupabaseClient;
    const balances = await getDeliverableBalances(admin, 'client-1');
    expect(balances).toHaveLength(3);
    expect(balances.every((b) => b.hasRow === false)).toBe(true);
  });
});
