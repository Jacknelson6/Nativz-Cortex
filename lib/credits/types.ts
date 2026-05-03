/**
 * Credits feature v1 — TypeScript types
 *
 * Mirrors the shapes from supabase/migrations/220_credits_v1.sql:
 *   - credit_transactions.kind enum
 *   - credit_transactions.charge_unit_kind enum
 *   - client_credit_balances.rollover_policy enum
 *   - RPC return shapes (consume_credit / refund_credit / grant_credit /
 *     expire_credit / monthly_reset_for_client)
 *
 * Spec: tasks/credits-spec.md · PRD: tasks/prd-credits.md
 */

export type CreditTransactionKind =
  | 'grant_monthly'
  | 'grant_topup'
  | 'consume'
  | 'refund'
  | 'adjust'
  | 'expire';

export type ChargeUnitKind = 'drop_video' | 'scheduled_post';

export type RolloverPolicy = 'none' | 'cap' | 'unlimited';

export interface ClientCreditBalanceRow {
  client_id: string;
  current_balance: number;
  monthly_allowance: number;
  rollover_policy: RolloverPolicy;
  rollover_cap: number | null;
  period_started_at: string;
  period_ends_at: string;
  next_reset_at: string;
  opening_balance_at_period_start: number;
  auto_grant_enabled: boolean;
  paused_until: string | null;
  pause_reason: string | null;
  low_balance_email_sent_at: string | null;
  low_balance_email_period_id: string | null;
  overdraft_email_sent_at: string | null;
  overdraft_email_period_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditTransactionRow {
  id: string;
  client_id: string | null;
  kind: CreditTransactionKind;
  delta: number;
  charge_unit_kind: ChargeUnitKind | null;
  charge_unit_id: string | null;
  scheduled_post_id: string | null;
  refund_for_id: string | null;
  share_link_id: string | null;
  reviewer_email: string | null;
  stripe_payment_intent: string | null;
  actor_user_id: string | null;
  note: string | null;
  idempotency_key: string | null;
  created_at: string;
}

// ---- RPC return shapes ----

export type ConsumeResult =
  | { already_consumed: true; consume_id: string }
  | { consumed: true; tx_id: string; new_balance: number };

export type RefundResult =
  | { no_consume_to_refund: true }
  | { refunded: true; tx_id: string; orphan: true }
  | { refunded: true; tx_id: string; new_balance: number };

export type GrantResult =
  | { already_granted: true }
  | { granted: true; tx_id: string; new_balance: number };

export type ExpireResult =
  | { already_expired: true }
  | { expired: true; tx_id: string; new_balance: number };

export type MonthlyResetResult =
  | { not_found: true }
  | { already_reset: true }
  | { skipped_paused: true }
  | { zero_allowance_advanced: true }
  | { reset: true; tx_id: string; grant_delta: number; new_balance: number };

// ---- Helper type guards (cheap and JSON-friendly, no runtime deps) ----

export function isConsumed(
  r: ConsumeResult,
): r is { consumed: true; tx_id: string; new_balance: number } {
  return 'consumed' in r && r.consumed === true;
}

export function isRefunded(
  r: RefundResult,
): r is
  | { refunded: true; tx_id: string; orphan: true }
  | { refunded: true; tx_id: string; new_balance: number } {
  return 'refunded' in r && r.refunded === true;
}

export function isGranted(
  r: GrantResult,
): r is { granted: true; tx_id: string; new_balance: number } {
  return 'granted' in r && r.granted === true;
}
