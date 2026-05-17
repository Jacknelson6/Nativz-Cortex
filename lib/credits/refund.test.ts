import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { refundCredit } from './refund';

function makeSupabase(
  result: { data: unknown; error: { message: string } | null },
): { supabase: SupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => result);
  const supabase = { rpc } as unknown as SupabaseClient;
  return { supabase, rpc };
}

describe('refundCredit', () => {
  it('passes the typed args through to the refund_credit RPC', async () => {
    const { supabase, rpc } = makeSupabase({
      data: { refunded: true, tx_id: 'tx-1', new_balance: 5 },
      error: null,
    });

    await refundCredit(supabase, {
      chargeUnitKind: 'drop_video',
      chargeUnitId: 'dv-1',
      note: 'comment',
    });

    expect(rpc).toHaveBeenCalledWith('refund_credit', {
      p_charge_unit_kind: 'drop_video',
      p_charge_unit_id: 'dv-1',
      p_note: 'comment',
    });
  });

  it('coerces missing/undefined notes to null', async () => {
    const { supabase, rpc } = makeSupabase({
      data: { no_consume_to_refund: true },
      error: null,
    });

    await refundCredit(supabase, {
      chargeUnitKind: 'scheduled_post',
      chargeUnitId: 'sp-1',
    });

    const call = rpc.mock.calls[0]![1] as { p_note: unknown };
    expect(call.p_note).toBeNull();
  });

  it('returns the RefundResult on success (refunded)', async () => {
    const { supabase } = makeSupabase({
      data: { refunded: true, tx_id: 'tx-2', new_balance: 9 },
      error: null,
    });

    const result = await refundCredit(supabase, {
      chargeUnitKind: 'drop_video',
      chargeUnitId: 'dv-2',
    });

    expect(result).toEqual({ refunded: true, tx_id: 'tx-2', new_balance: 9 });
  });

  it('returns the RefundResult on no-op (already refunded)', async () => {
    const { supabase } = makeSupabase({
      data: { no_consume_to_refund: true },
      error: null,
    });

    const result = await refundCredit(supabase, {
      chargeUnitKind: 'drop_video',
      chargeUnitId: 'dv-3',
    });

    expect(result).toEqual({ no_consume_to_refund: true });
  });

  it('throws a descriptive Error when the RPC returns an error', async () => {
    const { supabase } = makeSupabase({
      data: null,
      error: { message: 'permission denied for function refund_credit' },
    });

    await expect(
      refundCredit(supabase, { chargeUnitKind: 'drop_video', chargeUnitId: 'dv-4' }),
    ).rejects.toThrow(/refund_credit failed: permission denied/);
  });
});
