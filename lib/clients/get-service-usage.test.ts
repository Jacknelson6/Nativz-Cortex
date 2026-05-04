import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getClientServiceUsage } from './get-service-usage';

interface TypeRow { id: string }
interface TxRow { kind: string; delta: number }

function makeSupabase(
  typeRow: TypeRow | null,
  txRows: TxRow[],
): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'deliverable_types') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: typeRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'credit_transactions') {
        const result = { data: txRows, error: null };
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          gte: () => chain,
          lt: () => Promise.resolve(result),
        };
        return chain;
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

const TYPE = { id: 'edit-type-1' };

describe('getClientServiceUsage', () => {
  it('returns 0 used for smm without touching the database', async () => {
    // null typeRow + empty rows; the mapping short-circuits before either query.
    const supabase = makeSupabase(null, []);
    const usage = await getClientServiceUsage(supabase, 'client-1', 'smm');
    expect(usage.used).toBe(0);
  });

  it('returns 0 used for blogging without touching the database', async () => {
    const supabase = makeSupabase(null, []);
    const usage = await getClientServiceUsage(supabase, 'client-1', 'blogging');
    expect(usage.used).toBe(0);
  });

  it('returns 0 used when the deliverable_type row is missing', async () => {
    const supabase = makeSupabase(null, [
      { kind: 'consume', delta: -1 },
    ]);
    const usage = await getClientServiceUsage(supabase, 'client-1', 'editing');
    expect(usage.used).toBe(0);
  });

  it('counts a single consume row as one used (absolute value)', async () => {
    const supabase = makeSupabase(TYPE, [
      { kind: 'consume', delta: -1 },
    ]);
    const usage = await getClientServiceUsage(supabase, 'client-1', 'editing');
    expect(usage.used).toBe(1);
  });

  it('sums multiple consumes', async () => {
    const supabase = makeSupabase(TYPE, [
      { kind: 'consume', delta: -1 },
      { kind: 'consume', delta: -1 },
      { kind: 'consume', delta: -1 },
    ]);
    const usage = await getClientServiceUsage(supabase, 'client-1', 'editing');
    expect(usage.used).toBe(3);
  });

  it('nets a consume + refund pair to zero', async () => {
    const supabase = makeSupabase(TYPE, [
      { kind: 'consume', delta: -1 },
      { kind: 'refund', delta: 1 },
    ]);
    const usage = await getClientServiceUsage(supabase, 'client-1', 'editing');
    expect(usage.used).toBe(0);
  });

  it('floors at zero when refunds outweigh consumes (legacy data)', async () => {
    const supabase = makeSupabase(TYPE, [
      { kind: 'refund', delta: 2 },
      { kind: 'consume', delta: -1 },
    ]);
    const usage = await getClientServiceUsage(supabase, 'client-1', 'editing');
    expect(usage.used).toBe(0);
  });

  it('treats delta as absolute regardless of sign', async () => {
    const supabase = makeSupabase(TYPE, [
      { kind: 'consume', delta: 1 },
      { kind: 'consume', delta: -2 },
    ]);
    const usage = await getClientServiceUsage(supabase, 'client-1', 'editing');
    expect(usage.used).toBe(3);
  });

  it('treats missing delta as zero', async () => {
    const supabase = makeSupabase(TYPE, [
      { kind: 'consume' } as TxRow,
      { kind: 'consume', delta: -1 },
    ]);
    const usage = await getClientServiceUsage(supabase, 'client-1', 'editing');
    expect(usage.used).toBe(1);
  });

  it('returns ISO YYYY-MM-DD period bounds for the current UTC month', async () => {
    const supabase = makeSupabase(TYPE, []);
    const usage = await getClientServiceUsage(supabase, 'client-1', 'editing');
    expect(usage.periodStart).toMatch(/^\d{4}-\d{2}-01$/);
    expect(usage.periodEnd).toMatch(/^\d{4}-\d{2}-01$/);
    expect(usage.periodStart).not.toBe(usage.periodEnd);
  });
});
