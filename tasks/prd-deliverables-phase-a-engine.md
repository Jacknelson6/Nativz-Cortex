# PRD: Deliverables Phase A — Multi-Type Engine Evolution

## Why this exists

The existing credits engine assumes **one fungible unit type**: `current_balance` is a single integer per client, `monthly_allowance` is a single integer per client, and `charge_unit_kind` is a 2-value enum (`drop_video | scheduled_post`). The Anderson Collaborative editing packages prove that's wrong: real packages bundle **multiple deliverable types at once** with different counts and different per-unit costs:

- Essentials: 10 edited videos
- Studio: 20 edited videos + 50 static graphics
- Full Social: 20 edited videos + 5 UGC videos + 100 static graphics

A flat integer balance can't represent "you have 12 edited videos and 3 UGC videos and 27 static graphics left this month." Phase A evolves the engine from a single-type credit ledger to a multi-type deliverable ledger without losing any of the correctness work already in place.

## Goals

- Track balance, allowance, and consumption per `(client, deliverable_type)` instead of per `(client)`
- Replace `charge_unit_kind` enum with a `deliverable_types` lookup table seeded with `edited_video`, `ugc_video`, `static_graphic`
- Keep all existing correctness properties: idempotent grants/consumes/refunds, race-safe monthly reset, daily reconciliation, immutable ledger
- Backfill existing balance rows so the system stays operational through the migration

## Non-goals

- Renaming `credits/*` directories or RPCs (internal naming stays — the point of the directional pivot is external framing)
- Building any new product UI surfaces (Phase B)
- Wiring named package tiers (Phase D)

## Schema changes (migration 221_deliverables_v1.sql)

### New tables

```sql
CREATE TABLE deliverable_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,           -- 'edited_video', 'ugc_video', 'static_graphic'
  client_label text NOT NULL,          -- 'Edited Video', 'UGC Video', 'Static Graphic'
  client_label_plural text NOT NULL,   -- 'Edited Videos', etc.
  internal_notes text,                 -- 'Cortex-batch-produced; cheap.', etc.
  unit_cost_cents integer NOT NULL,    -- 15000 for edited_video, 20000 for ugc_video, etc.
  default_credit_weight integer NOT NULL DEFAULT 1, -- reserved for premium-tier weighting
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seeds (inside migration)
INSERT INTO deliverable_types (slug, client_label, client_label_plural, unit_cost_cents, sort_order) VALUES
  ('edited_video',   'Edited Video',   'Edited Videos',   15000, 10),
  ('ugc_video',      'UGC Video',      'UGC Videos',      20000, 20),
  ('static_graphic', 'Static Graphic', 'Static Graphics',  3000, 30);
```

### Evolved tables

```sql
-- New shape: PK is (client_id, deliverable_type_id)
CREATE TABLE client_deliverable_balances (
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  deliverable_type_id uuid NOT NULL REFERENCES deliverable_types(id),
  current_balance integer NOT NULL DEFAULT 0,
  opening_balance_at_period_start integer NOT NULL DEFAULT 0,
  monthly_allowance integer NOT NULL DEFAULT 0,
  rollover_policy text NOT NULL DEFAULT 'none' CHECK (rollover_policy IN ('none','cap','unlimited')),
  rollover_cap integer,
  auto_grant_enabled boolean NOT NULL DEFAULT true,
  paused_until timestamptz,
  period_started_at timestamptz NOT NULL DEFAULT now(),
  next_reset_at timestamptz NOT NULL,
  last_low_balance_email_at timestamptz,
  last_overdraft_email_at timestamptz,
  PRIMARY KEY (client_id, deliverable_type_id)
);

CREATE INDEX idx_client_deliverable_balances_next_reset
  ON client_deliverable_balances (next_reset_at)
  WHERE auto_grant_enabled = true;

-- Renamed/evolved transactions table
CREATE TABLE deliverable_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  deliverable_type_id uuid NOT NULL REFERENCES deliverable_types(id),
  delta integer NOT NULL,                -- positive = grant; negative = consume
  kind text NOT NULL CHECK (kind IN ('grant_monthly','grant_topup','grant_manual','consume','refund','expire','adjust')),
  charge_unit_kind text,                 -- 'drop_video' | 'scheduled_post' (kept as text not enum)
  charge_unit_id uuid,                   -- the deliverable being consumed (drop_video.id or scheduled_post.id)
  idempotency_key text UNIQUE,           -- 'topup:cs_xxx', 'expire:refund:re_xxx', etc.
  stripe_event_id text,
  stripe_charge_id text,
  stripe_refund_id text,
  stripe_dispute_id text,
  acted_by uuid REFERENCES auth.users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deliverable_tx_client_type_created
  ON deliverable_transactions (client_id, deliverable_type_id, created_at DESC);

CREATE INDEX idx_deliverable_tx_charge_unit
  ON deliverable_transactions (charge_unit_id, deliverable_type_id)
  WHERE charge_unit_id IS NOT NULL;
```

### Renamed gap table

```sql
CREATE TABLE deliverable_ledger_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  deliverable_type_id uuid NOT NULL REFERENCES deliverable_types(id),
  expected_balance integer NOT NULL,
  actual_balance integer NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  resolution_kind text -- 'adjust' | 'rebuild' | 'noop'
);
```

### Backfill

```sql
-- 1. For every existing client_credit_balances row, create the equivalent
--    client_deliverable_balances row keyed to edited_video (the only type
--    the system supported before).
INSERT INTO client_deliverable_balances (
  client_id, deliverable_type_id, current_balance,
  opening_balance_at_period_start, monthly_allowance, rollover_policy,
  rollover_cap, auto_grant_enabled, paused_until, period_started_at,
  next_reset_at, last_low_balance_email_at, last_overdraft_email_at
)
SELECT
  b.client_id,
  (SELECT id FROM deliverable_types WHERE slug = 'edited_video'),
  b.current_balance, b.opening_balance_at_period_start, b.monthly_allowance,
  b.rollover_policy, b.rollover_cap, b.auto_grant_enabled, b.paused_until,
  b.period_started_at, b.next_reset_at, b.last_low_balance_email_at,
  b.last_overdraft_email_at
FROM client_credit_balances b;

-- 2. Mirror credit_transactions → deliverable_transactions, all rows tagged
--    deliverable_type_id = edited_video. Preserve original IDs and timestamps.
INSERT INTO deliverable_transactions (
  id, client_id, deliverable_type_id, delta, kind, charge_unit_kind,
  charge_unit_id, idempotency_key, stripe_event_id, stripe_charge_id,
  stripe_refund_id, stripe_dispute_id, acted_by, reason, created_at
)
SELECT
  t.id, t.client_id,
  (SELECT id FROM deliverable_types WHERE slug = 'edited_video'),
  t.delta, t.kind, t.charge_unit_kind, t.charge_unit_id, t.idempotency_key,
  t.stripe_event_id, t.stripe_charge_id, t.stripe_refund_id, t.stripe_dispute_id,
  t.acted_by, t.reason, t.created_at
FROM credit_transactions t;

-- 3. Old tables stay in place but read-only. Drop in migration 222 after one
--    full reconciliation cycle confirms parity.
COMMENT ON TABLE client_credit_balances IS 'DEPRECATED 2026-05-02. Read-only mirror of client_deliverable_balances filtered to edited_video. Drop after one full reconciliation cycle confirms parity.';
COMMENT ON TABLE credit_transactions IS 'DEPRECATED 2026-05-02. Read-only mirror of deliverable_transactions filtered to edited_video. Drop after one full reconciliation cycle confirms parity.';
```

## RPC changes

All RPCs gain a `p_deliverable_type_id uuid` parameter. Signatures:

| RPC | New signature |
|---|---|
| `grant_deliverables(p_client_id uuid, p_type_id uuid, p_count int, p_kind text, p_idempotency_key text, p_metadata jsonb)` | Grants N units of a type. Idempotent on `idempotency_key`. |
| `consume_deliverable(p_client_id uuid, p_type_id uuid, p_charge_unit_kind text, p_charge_unit_id uuid)` | State-dedup: locks `(client, type)` row, checks for unrefunded consume on same `(charge_unit_id, type)`. |
| `refund_deliverable(p_client_id uuid, p_type_id uuid, p_charge_unit_id uuid)` | Inverse of consume. Returns `{refunded: bool, neutralized_consume_id: uuid}`. |
| `expire_deliverables(p_client_id uuid, p_type_id uuid, p_count int, p_idempotency_key text, p_metadata jsonb)` | Refund/dispute claw-back. |
| `monthly_reset_for_client(p_client_id uuid)` | **Loops over all deliverable types** for the client. One call processes all type rows in one transaction. |
| `monthly_reset_for_type(p_client_id uuid, p_type_id uuid)` | Internal helper called by the above. Same in-lock recheck of `next_reset_at`. |

Old RPCs (`grant_credit`, `consume_credit`, etc.) get backward-compatible shims that call the new RPCs with `type_id = edited_video`. The shims log a warning so we can grep callers and remove later.

## File changes

### Edits

| File | Change |
|---|---|
| `lib/credits/grant.ts` | Accept optional `deliverableTypeSlug` (defaults to `'edited_video'`); resolve to ID; call `grant_deliverables`. |
| `lib/credits/consume.ts` | Same: accept slug, default to `'edited_video'`, call `consume_deliverable`. |
| `lib/credits/refund.ts` | Same. |
| `lib/credits/types.ts` | Add `DeliverableType`, `DeliverableBalance`, `DeliverableTransaction` types. |
| `lib/credits/resolve-charge-unit.ts` | Replace enum with lookup against `deliverable_types`. Drop `charge_unit_kind` 2-value enum and read from new table. |
| `lib/credits/webhook.ts` | `findCreditsGrantForCharge` becomes `findDeliverableGrantForCharge`. Refund math uses `unit_amount = charge.amount / count` against the matching `deliverable_transactions` row, unchanged math, just the table reference moves. |
| `lib/credits/comment-hooks.ts` | `consumeForApproval` resolves type via `(content_drop_video → drop → client → type override)` chain or defaults to `edited_video`. The drop already knows what kind of deliverable it produces. |
| `app/api/cron/credits-reset/route.ts` | Iterate `client_deliverable_balances` rows. Group by client_id, call `monthly_reset_for_client` once per client (RPC handles all types internally). |
| `app/api/cron/credits-reconcile/route.ts` | Reconcile per `(client_id, type_id)` row. Gap rows now carry type_id. |
| `app/api/credits/[clientId]/grant/route.ts` | Accept `deliverable_type_slug` in body; default `edited_video`. |
| `app/api/credits/[clientId]/allowance/route.ts` | Accept JSON of `{type_slug: count}` instead of single integer. PUT updates all rows for the client in a transaction. |

### New files

| File | Purpose |
|---|---|
| `lib/deliverables/types-cache.ts` | Module-level cache of `deliverable_types` rows keyed by slug + id. Loaded lazily, refreshed every 60s. Used everywhere that needs slug→id resolution. |
| `lib/deliverables/get-balances.ts` | Single-call helper: `getDeliverableBalances(clientId)` returns `{ [slug]: BalanceRow }`. Used by Phase B UI. |

## Acceptance criteria

- [ ] Migration 221 applies cleanly to dev DB. Backfill produces exactly N new rows in `client_deliverable_balances` for the N existing `client_credit_balances` rows.
- [ ] All existing credit RPCs still work via backward-compat shims (one approval flow round-trip on a test client returns the same result before and after migration).
- [ ] `consume_deliverable` is idempotent: approve → unapprove → re-approve produces exactly one net `consume` row.
- [ ] `monthly_reset_for_client` is at-least-once safe: calling it twice in 100ms grants once.
- [ ] Reconciliation cron produces 0 gaps on a freshly-reset DB.
- [ ] Backfilled `deliverable_transactions.id` values match original `credit_transactions.id` values.

## Verify gates

1. `npx tsc --noEmit` passes
2. `npm run lint` clean for changed files
3. Manual SQL spot-check: `SELECT COUNT(*) FROM client_credit_balances` == `SELECT COUNT(*) FROM client_deliverable_balances WHERE deliverable_type_id = (SELECT id FROM deliverable_types WHERE slug = 'edited_video')`
4. One end-to-end approve/unapprove cycle on a dev client produces the right ledger trail in `deliverable_transactions`
5. Commit + push to main
