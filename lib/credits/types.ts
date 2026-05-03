/**
 * Credits feature — TypeScript types (multi-type evolution).
 *
 * Internal accounting layer. Database tables stay `credit_*` for stability;
 * client-visible surfaces speak "deliverables / production capacity / monthly
 * output" via lib/deliverables/copy.ts.
 *
 * Mirrors the schema from:
 *   - supabase/migrations/220_credits_v1.sql (base ledger)
 *   - supabase/migrations/221_deliverables_v1.sql (deliverable_types lookup,
 *     per-(client, type) PK on client_credit_balances, deliverable_type_id
 *     stamped on every transaction + gap row)
 *
 * Spec: tasks/prd-deliverables-phase-a-engine.md
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

/**
 * Slugs for the seeded deliverable types. Adding a new type means seeding a
 * row in `deliverable_types` AND extending this union; no schema migration
 * required for the ledger itself.
 */
export type DeliverableTypeSlug = 'edited_video' | 'ugc_video' | 'static_graphic';

export interface DeliverableTypeRow {
  id: string;
  slug: DeliverableTypeSlug;
  label_singular: string;
  label_plural: string;
  unit_cost_cents: number;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ClientCreditBalanceRow {
  client_id: string;
  /**
   * Per-type discriminator. NOT NULL after migration 221. Joined to
   * `deliverable_types.id` for the slug + display label.
   */
  deliverable_type_id: string;
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
  /**
   * Per-type discriminator. NOT NULL after migration 221. Backfilled to
   * 'edited_video' for historical rows.
   */
  deliverable_type_id: string;
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

export type ResetBalanceRowResult =
  | { not_found: true }
  | { already_reset: true }
  | { skipped_paused: true }
  | { zero_allowance_advanced: true }
  | { reset: true; tx_id: string; grant_delta: number; new_balance: number };

/**
 * `monthly_reset_for_client(p_client_id)` is the back-compat shim that loops
 * every (client, deliverable_type) row and aggregates the per-row results.
 *
 *   - `{ not_found: true }` when the client has zero balance rows
 *   - `{ per_type_results: [{ type_id, result }] }` otherwise
 *
 * Callers tally per-bucket counts client-side; the per-row `result` is the
 * canonical signal for telemetry.
 */
export type MonthlyResetResult =
  | { not_found: true }
  | {
      per_type_results: Array<{
        type_id: string;
        result: ResetBalanceRowResult;
      }>;
    };

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

export function isReset(
  r: ResetBalanceRowResult,
): r is { reset: true; tx_id: string; grant_delta: number; new_balance: number } {
  return 'reset' in r && r.reset === true;
}
