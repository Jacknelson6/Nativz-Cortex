/**
 * refundCredit — typed wrapper around the `refund_credit` RPC.
 *
 * Three trigger sites:
 *   1. Approval-comment delete on the share-link review surface
 *   2. changes_requested on a charge unit that already has an unrefunded consume
 *   3. BEFORE DELETE trigger on scheduled_posts (cascade refund)
 *
 * State-based dedup: if the latest consume on this charge unit is already
 * refunded, the RPC returns `{ no_consume_to_refund: true }` and is a safe
 * no-op.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChargeUnitKind, RefundResult } from './types';

export interface RefundCreditArgs {
  chargeUnitKind: ChargeUnitKind;
  chargeUnitId: string;
  note?: string | null;
}

export async function refundCredit(
  supabase: SupabaseClient,
  args: RefundCreditArgs,
): Promise<RefundResult> {
  const { data, error } = await supabase.rpc('refund_credit', {
    p_charge_unit_kind: args.chargeUnitKind,
    p_charge_unit_id: args.chargeUnitId,
    p_note: args.note ?? null,
  });
  if (error) {
    throw new Error(`refund_credit failed: ${error.message}`);
  }
  return data as RefundResult;
}
