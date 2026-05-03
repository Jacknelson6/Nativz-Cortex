/**
 * grantCredit / expireCredit — typed wrappers around the grant/expire RPCs.
 *
 * `grant_credit` handles admin manual grants AND Stripe top-ups. Key-based
 * dedup via the partial UNIQUE index on credit_transactions.idempotency_key
 * (only enforced for kind IN ('grant_topup', 'expire')).
 *
 * `expire_credit` handles Stripe refunds / dispute claw-backs (negative
 * delta). Same partial UNIQUE index handles the dedup.
 *
 * Both RPCs gained `p_deliverable_type_slug` in migration 221 (default
 * `'edited_video'`). New callers should always pass the slug; the default
 * keeps the legacy single-type call sites working unchanged.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliverableTypeSlug, ExpireResult, GrantResult } from './types';

export interface GrantCreditArgs {
  clientId: string;
  kind: 'grant_topup' | 'adjust';
  delta: number;
  idempotencyKey?: string | null;
  note?: string | null;
  actorUserId?: string | null;
  stripePaymentIntent?: string | null;
  /** Defaults to 'edited_video' on the RPC side if omitted. */
  deliverableTypeSlug?: DeliverableTypeSlug;
}

export async function grantCredit(
  supabase: SupabaseClient,
  args: GrantCreditArgs,
): Promise<GrantResult> {
  const { data, error } = await supabase.rpc('grant_credit', {
    p_client_id: args.clientId,
    p_kind: args.kind,
    p_delta: args.delta,
    p_idempotency_key: args.idempotencyKey ?? null,
    p_note: args.note ?? null,
    p_actor_user_id: args.actorUserId ?? null,
    p_stripe_payment_intent: args.stripePaymentIntent ?? null,
    p_deliverable_type_slug: args.deliverableTypeSlug ?? 'edited_video',
  });
  if (error) {
    throw new Error(`grant_credit failed: ${error.message}`);
  }
  return data as GrantResult;
}

export interface ExpireCreditArgs {
  clientId: string;
  delta: number; // must be negative
  idempotencyKey: string;
  note: string;
  /** Defaults to 'edited_video' on the RPC side if omitted. */
  deliverableTypeSlug?: DeliverableTypeSlug;
}

export async function expireCredit(
  supabase: SupabaseClient,
  args: ExpireCreditArgs,
): Promise<ExpireResult> {
  if (args.delta >= 0) {
    throw new Error(`expireCredit delta must be negative (got ${args.delta})`);
  }
  const { data, error } = await supabase.rpc('expire_credit', {
    p_client_id: args.clientId,
    p_delta: args.delta,
    p_idempotency_key: args.idempotencyKey,
    p_note: args.note,
    p_deliverable_type_slug: args.deliverableTypeSlug ?? 'edited_video',
  });
  if (error) {
    throw new Error(`expire_credit failed: ${error.message}`);
  }
  return data as ExpireResult;
}
