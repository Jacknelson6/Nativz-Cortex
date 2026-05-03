/**
 * consumeCredit — typed wrapper around the `consume_credit` RPC.
 *
 * Approval-as-consumption hook. State-based dedup: re-firing on the same
 * charge unit (drop_video.id preferred, scheduled_post.id fallback) is a
 * safe no-op when there's still an unrefunded consume row.
 *
 * Returns the RPC payload as-is so callers can branch on
 * `already_consumed` vs `consumed`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChargeUnitKind, ConsumeResult } from './types';

export interface ConsumeCreditArgs {
  clientId: string;
  chargeUnitKind: ChargeUnitKind;
  chargeUnitId: string;
  scheduledPostId?: string | null;
  shareLinkId?: string | null;
  reviewerEmail?: string | null;
}

export async function consumeCredit(
  supabase: SupabaseClient,
  args: ConsumeCreditArgs,
): Promise<ConsumeResult> {
  const { data, error } = await supabase.rpc('consume_credit', {
    p_client_id: args.clientId,
    p_charge_unit_kind: args.chargeUnitKind,
    p_charge_unit_id: args.chargeUnitId,
    p_scheduled_post_id: args.scheduledPostId ?? null,
    p_share_link_id: args.shareLinkId ?? null,
    p_reviewer_email: args.reviewerEmail ?? null,
  });
  if (error) {
    throw new Error(`consume_credit failed: ${error.message}`);
  }
  return data as ConsumeResult;
}
