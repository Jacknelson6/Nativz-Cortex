/**
 * consumeCredit — typed wrapper around the `consume_credit` RPC.
 *
 * Approval-as-consumption hook. State-based dedup: re-firing on the same
 * (charge_unit, deliverable_type) is a safe no-op when there's still an
 * unrefunded consume row.
 *
 * After migration 221 the RPC takes an optional `p_deliverable_type_slug`
 * (default `'edited_video'` for back-compat). Callers from new code should
 * always pass an explicit slug; the default keeps the silent-overdraft fix
 * working while we migrate call sites.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChargeUnitKind, ConsumeResult, DeliverableTypeSlug } from './types';

export interface ConsumeCreditArgs {
  clientId: string;
  chargeUnitKind: ChargeUnitKind;
  chargeUnitId: string;
  scheduledPostId?: string | null;
  shareLinkId?: string | null;
  reviewerEmail?: string | null;
  /** Defaults to 'edited_video' on the RPC side if omitted. */
  deliverableTypeSlug?: DeliverableTypeSlug;
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
    p_deliverable_type_slug: args.deliverableTypeSlug ?? 'edited_video',
  });
  if (error) {
    throw new Error(`consume_credit failed: ${error.message}`);
  }
  return data as ConsumeResult;
}
