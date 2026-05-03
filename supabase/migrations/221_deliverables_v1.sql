-- =============================================================================
-- 221_deliverables_v1.sql
-- Multi-type deliverables: evolve the credits ledger from a single fungible
-- "credit" to a per-deliverable-type capacity unit (edited_video, ugc_video,
-- static_graphic, ...).
--
-- Design choice (Option 1):
--   Internal DB names stay as `credit_*` because credits is the right
--   abstraction for a per-unit capacity ledger (premium types could cost
--   2 units, etc). Only the client-facing surfaces speak "deliverables".
--   See memory/project_credits_directional_pivot.md for the full rationale.
--
-- This migration is additive + a PK change:
--   1. Add `deliverable_types` lookup with three seeded types
--   2. Add `deliverable_type_id` column to client_credit_balances,
--      credit_transactions, credit_ledger_gaps
--   3. Backfill every existing row to `edited_video`
--   4. Lift client_credit_balances PK from (client_id) to
--      (client_id, deliverable_type_id) so multiple types per client are valid
--   5. Drop the CHECK on credit_transactions.charge_unit_kind (the
--      deliverable_type_id is now the type discriminator; charge_unit_kind
--      just records "what physical thing was approved")
--   6. Update RPCs to accept an optional `p_deliverable_type_slug` (default
--      'edited_video' for back-compat with existing callers)
--   7. monthly_reset_for_client(client_id) loops over all type-rows for that
--      client; new reset_balance_row(client_id, type_id) handles a single row
--
-- Migration is idempotent under retry (CREATE TABLE IF NOT EXISTS, partial
-- backfills guarded by NULL check, etc).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. deliverable_types lookup
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS deliverable_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label_singular TEXT NOT NULL,
  label_plural TEXT NOT NULL,
  -- Per-unit cost in cents. Used by the margin view (Phase C) and the
  -- add-on pricing page (Phase B). Not used by the consume RPC; consumes
  -- always decrement the per-type balance by 1.
  unit_cost_cents INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE deliverable_types IS
  'Lookup of deliverable types (edited_video, ugc_video, static_graphic). '
  'Replaces the hard-coded charge_unit enum so adding a new type is a row '
  'insert, not a schema migration.';

INSERT INTO deliverable_types (slug, label_singular, label_plural, unit_cost_cents, description, sort_order)
VALUES
  ('edited_video',   'Edited Video',   'Edited Videos',   15000,
    'Short-form edited video, vertical, captions and music included, one round of revisions.', 10),
  ('ugc_video',      'UGC Video',      'UGC Videos',      20000,
    'Original creator-style video, monthly cadence, sourced from your in-house creators.', 20),
  ('static_graphic', 'Static Graphic', 'Static Graphics',  3000,
    'Cortex-produced static graphic, batch delivery.', 30)
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Add deliverable_type_id to existing tables (nullable initially for safe
--    backfill; we tighten + repk after backfill)
-- -----------------------------------------------------------------------------

ALTER TABLE client_credit_balances
  ADD COLUMN IF NOT EXISTS deliverable_type_id UUID REFERENCES deliverable_types(id);

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS deliverable_type_id UUID REFERENCES deliverable_types(id);

ALTER TABLE credit_ledger_gaps
  ADD COLUMN IF NOT EXISTS deliverable_type_id UUID REFERENCES deliverable_types(id);

-- failed_email_attempts is per-template; threading the type lets the daily
-- admin digest group "low_balance email failed for client X, edited_video"
-- distinct from "...static_graphic". Nullable on purpose: pre-migration rows
-- have no type context, and unrelated email failures (anything not credit
-- threshold related) won't carry one either.
ALTER TABLE failed_email_attempts
  ADD COLUMN IF NOT EXISTS deliverable_type_id UUID REFERENCES deliverable_types(id);

-- -----------------------------------------------------------------------------
-- 3. Backfill: every existing row keys to 'edited_video'
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_edited_id UUID;
BEGIN
  SELECT id INTO v_edited_id FROM deliverable_types WHERE slug = 'edited_video';

  UPDATE client_credit_balances
  SET deliverable_type_id = v_edited_id
  WHERE deliverable_type_id IS NULL;

  UPDATE credit_transactions
  SET deliverable_type_id = v_edited_id
  WHERE deliverable_type_id IS NULL;

  UPDATE credit_ledger_gaps
  SET deliverable_type_id = v_edited_id
  WHERE deliverable_type_id IS NULL;

  -- Backfill only the credit threshold templates; other templates legitimately
  -- have no type context.
  UPDATE failed_email_attempts
  SET deliverable_type_id = v_edited_id
  WHERE deliverable_type_id IS NULL
    AND template IN ('credits_low_balance', 'credits_overdraft');
END $$;

-- -----------------------------------------------------------------------------
-- 4. Tighten + re-key: deliverable_type_id is now NOT NULL on balances + tx
-- -----------------------------------------------------------------------------

ALTER TABLE client_credit_balances
  ALTER COLUMN deliverable_type_id SET NOT NULL;

ALTER TABLE credit_transactions
  ALTER COLUMN deliverable_type_id SET NOT NULL;

-- Lift the PK from (client_id) to (client_id, deliverable_type_id).
-- This is the multi-type unlock: a client can hold an Edited Video balance
-- AND a Static Graphic balance simultaneously.
ALTER TABLE client_credit_balances
  DROP CONSTRAINT IF EXISTS client_credit_balances_pkey;

ALTER TABLE client_credit_balances
  ADD CONSTRAINT client_credit_balances_pkey
    PRIMARY KEY (client_id, deliverable_type_id);

-- -----------------------------------------------------------------------------
-- 5. Drop the CHECK constraint on charge_unit_kind so the column is free-form
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'credit_transactions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%charge_unit_kind%IN%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE credit_transactions DROP CONSTRAINT ' || quote_ident(v_constraint_name);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6. Indexes for type-aware queries
-- -----------------------------------------------------------------------------

-- Per-type balance scan (Phase B's "show all type balances for this client").
CREATE INDEX IF NOT EXISTS idx_balances_client_type
  ON client_credit_balances(client_id, deliverable_type_id);

-- Per-type ledger view (admin shell tabs by type, recent activity panel).
CREATE INDEX IF NOT EXISTS idx_credit_tx_client_type_created
  ON credit_transactions(client_id, deliverable_type_id, created_at DESC);

-- Type lookup by slug is the hot path for client code (resolve once per request).
CREATE INDEX IF NOT EXISTS idx_deliverable_types_slug
  ON deliverable_types(slug)
  WHERE is_active IS TRUE;

-- -----------------------------------------------------------------------------
-- 7. RPC updates
--    Strategy: drop and recreate. Adding a default param to an existing
--    function signature is risky; cleaner to drop + re-create with the new
--    signature.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS consume_credit(UUID, TEXT, UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS refund_credit(TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS grant_credit(UUID, TEXT, INTEGER, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS expire_credit(UUID, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS monthly_reset_for_client(UUID);

-- Helper: resolve a type slug → id, defaulting to edited_video.
CREATE OR REPLACE FUNCTION _resolve_deliverable_type_id(p_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM deliverable_types
  WHERE slug = COALESCE(NULLIF(p_slug, ''), 'edited_video')
    AND is_active IS TRUE;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'unknown deliverable type slug: %', p_slug;
  END IF;
  RETURN v_id;
END;
$$;

-- consume_credit: state-based dedup against the (charge_unit_kind, charge_unit_id)
-- pair. The deliverable_type stamps the row + decrements the right balance.
CREATE OR REPLACE FUNCTION consume_credit(
  p_client_id UUID,
  p_charge_unit_kind TEXT,
  p_charge_unit_id UUID,
  p_scheduled_post_id UUID DEFAULT NULL,
  p_share_link_id UUID DEFAULT NULL,
  p_reviewer_email TEXT DEFAULT NULL,
  p_deliverable_type_slug TEXT DEFAULT 'edited_video'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_type_id UUID;
  v_balance INTEGER;
  v_existing_consume_id UUID;
  v_cycle INTEGER;
  v_tx_id UUID;
BEGIN
  v_type_id := _resolve_deliverable_type_id(p_deliverable_type_slug);

  -- Lock the (client, type) balance row so concurrent fires serialise.
  SELECT current_balance INTO v_balance
  FROM client_credit_balances
  WHERE client_id = p_client_id
    AND deliverable_type_id = v_type_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'no balance row for client % / type %', p_client_id, p_deliverable_type_slug;
  END IF;

  -- State-based dedup: is there an unrefunded consume on this charge unit?
  SELECT c.id INTO v_existing_consume_id
  FROM credit_transactions c
  WHERE c.charge_unit_kind = p_charge_unit_kind
    AND c.charge_unit_id = p_charge_unit_id
    AND c.kind = 'consume'
    AND NOT EXISTS (
      SELECT 1 FROM credit_transactions r
      WHERE r.refund_for_id = c.id AND r.kind = 'refund'
    )
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_existing_consume_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already_consumed', true,
      'consume_id', v_existing_consume_id
    );
  END IF;

  -- Cycle counter for the human-readable label
  SELECT COUNT(*) INTO v_cycle
  FROM credit_transactions
  WHERE charge_unit_kind = p_charge_unit_kind
    AND charge_unit_id = p_charge_unit_id
    AND kind = 'consume';

  INSERT INTO credit_transactions (
    client_id, kind, delta, deliverable_type_id,
    charge_unit_kind, charge_unit_id, scheduled_post_id,
    share_link_id, reviewer_email,
    idempotency_key
  ) VALUES (
    p_client_id, 'consume', -1, v_type_id,
    p_charge_unit_kind, p_charge_unit_id, p_scheduled_post_id,
    p_share_link_id, p_reviewer_email,
    'consume:' || p_charge_unit_kind || ':' || p_charge_unit_id::text
      || ':type:' || p_deliverable_type_slug || ':cycle:' || (v_cycle + 1)::text
  ) RETURNING id INTO v_tx_id;

  UPDATE client_credit_balances
  SET current_balance = current_balance - 1,
      updated_at = now()
  WHERE client_id = p_client_id
    AND deliverable_type_id = v_type_id;

  RETURN jsonb_build_object(
    'consumed', true,
    'tx_id', v_tx_id,
    'new_balance', v_balance - 1,
    'deliverable_type_slug', p_deliverable_type_slug
  );
END;
$$;

-- refund_credit: type follows the consume row (no slug param needed).
CREATE OR REPLACE FUNCTION refund_credit(
  p_charge_unit_kind TEXT,
  p_charge_unit_id UUID,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_consume_row credit_transactions%ROWTYPE;
  v_tx_id UUID;
  v_new_balance INTEGER;
BEGIN
  SELECT c.* INTO v_consume_row
  FROM credit_transactions c
  WHERE c.charge_unit_kind = p_charge_unit_kind
    AND c.charge_unit_id = p_charge_unit_id
    AND c.kind = 'consume'
    AND NOT EXISTS (
      SELECT 1 FROM credit_transactions r
      WHERE r.refund_for_id = c.id AND r.kind = 'refund'
    )
  ORDER BY c.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_consume_row.id IS NULL THEN
    RETURN jsonb_build_object('no_consume_to_refund', true);
  END IF;

  IF v_consume_row.client_id IS NULL THEN
    INSERT INTO credit_transactions (
      client_id, kind, delta, deliverable_type_id,
      charge_unit_kind, charge_unit_id, scheduled_post_id,
      refund_for_id, note,
      idempotency_key
    ) VALUES (
      NULL, 'refund', 1, v_consume_row.deliverable_type_id,
      p_charge_unit_kind, p_charge_unit_id, v_consume_row.scheduled_post_id,
      v_consume_row.id, COALESCE(p_note, 'orphan refund (client deleted)'),
      'refund:' || v_consume_row.id::text
    ) RETURNING id INTO v_tx_id;
    RETURN jsonb_build_object('refunded', true, 'tx_id', v_tx_id, 'orphan', true);
  END IF;

  -- Lock the matching (client, type) balance row.
  PERFORM 1 FROM client_credit_balances
  WHERE client_id = v_consume_row.client_id
    AND deliverable_type_id = v_consume_row.deliverable_type_id
  FOR UPDATE;

  INSERT INTO credit_transactions (
    client_id, kind, delta, deliverable_type_id,
    charge_unit_kind, charge_unit_id, scheduled_post_id,
    refund_for_id, note,
    idempotency_key
  ) VALUES (
    v_consume_row.client_id, 'refund', 1, v_consume_row.deliverable_type_id,
    p_charge_unit_kind, p_charge_unit_id, v_consume_row.scheduled_post_id,
    v_consume_row.id, p_note,
    'refund:' || v_consume_row.id::text
  ) RETURNING id INTO v_tx_id;

  UPDATE client_credit_balances
  SET current_balance = current_balance + 1,
      updated_at = now()
  WHERE client_id = v_consume_row.client_id
    AND deliverable_type_id = v_consume_row.deliverable_type_id
  RETURNING current_balance INTO v_new_balance;

  RETURN jsonb_build_object(
    'refunded', true,
    'tx_id', v_tx_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- grant_credit: admin manual + Stripe top-ups. Per-type now.
CREATE OR REPLACE FUNCTION grant_credit(
  p_client_id UUID,
  p_kind TEXT,
  p_delta INTEGER,
  p_idempotency_key TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_stripe_payment_intent TEXT DEFAULT NULL,
  p_deliverable_type_slug TEXT DEFAULT 'edited_video'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_type_id UUID;
  v_tx_id UUID;
  v_new_balance INTEGER;
BEGIN
  IF p_kind NOT IN ('grant_topup', 'adjust') THEN
    RAISE EXCEPTION 'invalid grant kind: %', p_kind;
  END IF;
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'delta cannot be zero';
  END IF;

  v_type_id := _resolve_deliverable_type_id(p_deliverable_type_slug);

  PERFORM 1 FROM client_credit_balances
  WHERE client_id = p_client_id
    AND deliverable_type_id = v_type_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Auto-create the (client, type) row with zero allowance, so manual
    -- grants on a type the client doesn't yet have configured still work.
    INSERT INTO client_credit_balances (client_id, deliverable_type_id)
    VALUES (p_client_id, v_type_id)
    ON CONFLICT (client_id, deliverable_type_id) DO NOTHING;
  END IF;

  BEGIN
    INSERT INTO credit_transactions (
      client_id, kind, delta, deliverable_type_id,
      stripe_payment_intent, actor_user_id, note,
      idempotency_key
    ) VALUES (
      p_client_id, p_kind, p_delta, v_type_id,
      p_stripe_payment_intent, p_actor_user_id, p_note,
      p_idempotency_key
    ) RETURNING id INTO v_tx_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('already_granted', true);
  END;

  UPDATE client_credit_balances
  SET current_balance = current_balance + p_delta,
      updated_at = now()
  WHERE client_id = p_client_id
    AND deliverable_type_id = v_type_id
  RETURNING current_balance INTO v_new_balance;

  RETURN jsonb_build_object(
    'granted', true,
    'tx_id', v_tx_id,
    'new_balance', v_new_balance,
    'deliverable_type_slug', p_deliverable_type_slug
  );
END;
$$;

-- expire_credit: Stripe refund / dispute claw-back. Per-type now.
CREATE OR REPLACE FUNCTION expire_credit(
  p_client_id UUID,
  p_delta INTEGER,
  p_idempotency_key TEXT,
  p_note TEXT,
  p_deliverable_type_slug TEXT DEFAULT 'edited_video'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_type_id UUID;
  v_tx_id UUID;
  v_new_balance INTEGER;
BEGIN
  IF p_delta >= 0 THEN
    RAISE EXCEPTION 'expire delta must be negative, got %', p_delta;
  END IF;

  v_type_id := _resolve_deliverable_type_id(p_deliverable_type_slug);

  PERFORM 1 FROM client_credit_balances
  WHERE client_id = p_client_id
    AND deliverable_type_id = v_type_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no balance row for client % / type %', p_client_id, p_deliverable_type_slug;
  END IF;

  BEGIN
    INSERT INTO credit_transactions (
      client_id, kind, delta, deliverable_type_id, note, idempotency_key
    ) VALUES (
      p_client_id, 'expire', p_delta, v_type_id, p_note, p_idempotency_key
    ) RETURNING id INTO v_tx_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('already_expired', true);
  END;

  UPDATE client_credit_balances
  SET current_balance = current_balance + p_delta,
      updated_at = now()
  WHERE client_id = p_client_id
    AND deliverable_type_id = v_type_id
  RETURNING current_balance INTO v_new_balance;

  RETURN jsonb_build_object(
    'expired', true,
    'tx_id', v_tx_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- reset_balance_row: per-(client, type) reset. Cron calls this once per row.
-- Same at-least-once-safe pattern as the v1 monthly_reset_for_client (re-checks
-- next_reset_at inside the lock).
CREATE OR REPLACE FUNCTION reset_balance_row(
  p_client_id UUID,
  p_deliverable_type_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row client_credit_balances%ROWTYPE;
  v_new_balance INTEGER;
  v_grant_delta INTEGER;
  v_new_period_started_at TIMESTAMPTZ;
  v_new_period_ends_at TIMESTAMPTZ;
  v_tx_id UUID;
BEGIN
  SELECT * INTO v_row
  FROM client_credit_balances
  WHERE client_id = p_client_id
    AND deliverable_type_id = p_deliverable_type_id
  FOR UPDATE;

  IF v_row.client_id IS NULL THEN
    RETURN jsonb_build_object('not_found', true);
  END IF;

  IF v_row.next_reset_at > now() THEN
    RETURN jsonb_build_object('already_reset', true);
  END IF;

  IF NOT v_row.auto_grant_enabled
     OR (v_row.paused_until IS NOT NULL AND v_row.paused_until > now()) THEN
    RETURN jsonb_build_object('skipped_paused', true);
  END IF;

  v_new_period_started_at := v_row.period_started_at + INTERVAL '1 month';
  v_new_period_ends_at := v_new_period_started_at + INTERVAL '1 month';

  IF v_row.monthly_allowance = 0 THEN
    UPDATE client_credit_balances
    SET period_started_at = v_new_period_started_at,
        period_ends_at = v_new_period_ends_at,
        next_reset_at = v_new_period_ends_at,
        opening_balance_at_period_start = current_balance,
        low_balance_email_period_id = NULL,
        low_balance_email_sent_at = NULL,
        overdraft_email_period_id = NULL,
        overdraft_email_sent_at = NULL,
        updated_at = now()
    WHERE client_id = p_client_id
      AND deliverable_type_id = p_deliverable_type_id;
    RETURN jsonb_build_object('zero_allowance_advanced', true);
  END IF;

  IF v_row.rollover_policy = 'none' THEN
    v_new_balance := v_row.monthly_allowance;
  ELSIF v_row.rollover_policy = 'unlimited' THEN
    v_new_balance := GREATEST(v_row.current_balance, 0) + v_row.monthly_allowance;
  ELSIF v_row.rollover_policy = 'cap' THEN
    v_new_balance := LEAST(
      GREATEST(v_row.current_balance, 0) + v_row.monthly_allowance,
      v_row.monthly_allowance + COALESCE(v_row.rollover_cap, 0)
    );
  ELSE
    RAISE EXCEPTION 'unknown rollover policy: %', v_row.rollover_policy;
  END IF;

  IF v_row.current_balance < 0 THEN
    v_new_balance := v_row.current_balance + v_row.monthly_allowance;
  END IF;

  v_grant_delta := v_new_balance - v_row.current_balance;

  INSERT INTO credit_transactions (
    client_id, kind, delta, deliverable_type_id, note,
    idempotency_key
  ) VALUES (
    p_client_id, 'grant_monthly', v_grant_delta, p_deliverable_type_id,
    'monthly reset (' || v_row.rollover_policy || ')',
    'grant_monthly:' || p_client_id::text || ':' || p_deliverable_type_id::text
      || ':' || v_new_period_started_at::date::text
  ) RETURNING id INTO v_tx_id;

  UPDATE client_credit_balances
  SET current_balance = v_new_balance,
      opening_balance_at_period_start = v_new_balance,
      period_started_at = v_new_period_started_at,
      period_ends_at = v_new_period_ends_at,
      next_reset_at = v_new_period_ends_at,
      low_balance_email_period_id = NULL,
      low_balance_email_sent_at = NULL,
      overdraft_email_period_id = NULL,
      overdraft_email_sent_at = NULL,
      updated_at = now()
  WHERE client_id = p_client_id
    AND deliverable_type_id = p_deliverable_type_id;

  RETURN jsonb_build_object(
    'reset', true,
    'tx_id', v_tx_id,
    'grant_delta', v_grant_delta,
    'new_balance', v_new_balance
  );
END;
$$;

-- monthly_reset_for_client: back-compat shim. Loops over all (client, type)
-- rows for the client and resets each. Returns an aggregate summary.
CREATE OR REPLACE FUNCTION monthly_reset_for_client(
  p_client_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row RECORD;
  v_results JSONB := '[]'::jsonb;
  v_per_row JSONB;
BEGIN
  FOR v_row IN
    SELECT deliverable_type_id
    FROM client_credit_balances
    WHERE client_id = p_client_id
  LOOP
    v_per_row := reset_balance_row(p_client_id, v_row.deliverable_type_id);
    v_results := v_results || jsonb_build_array(
      jsonb_build_object('type_id', v_row.deliverable_type_id, 'result', v_per_row)
    );
  END LOOP;

  IF jsonb_array_length(v_results) = 0 THEN
    RETURN jsonb_build_object('not_found', true);
  END IF;

  RETURN jsonb_build_object('per_type_results', v_results);
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Trigger: cascade-refund on scheduled_posts DELETE.
--    Same call signature; the refund RPC already pulls the type from the
--    consume row so the trigger needs no changes beyond re-pointing.
-- -----------------------------------------------------------------------------

-- Already defined in 220 — re-create the function in case of drift, then
-- re-attach the trigger.
CREATE OR REPLACE FUNCTION trg_scheduled_posts_refund_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_drop_video_id UUID;
BEGIN
  SELECT id INTO v_drop_video_id
  FROM content_drop_videos
  WHERE scheduled_post_id = OLD.id
  LIMIT 1;

  IF v_drop_video_id IS NOT NULL THEN
    PERFORM refund_credit('drop_video', v_drop_video_id,
      'scheduled_post deleted (id=' || OLD.id::text || ')');
  ELSE
    PERFORM refund_credit('scheduled_post', OLD.id,
      'scheduled_post deleted');
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS scheduled_posts_refund_credit ON scheduled_posts;
CREATE TRIGGER scheduled_posts_refund_credit
  BEFORE DELETE ON scheduled_posts
  FOR EACH ROW
  EXECUTE FUNCTION trg_scheduled_posts_refund_credit();

-- -----------------------------------------------------------------------------
-- 9. Backfill any missing edited_video balance rows for clients that exist
--    but somehow don't have one yet (defensive — 220 already inserted, but
--    a client could have been created in the small window before 221 ran).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_edited_id UUID;
BEGIN
  SELECT id INTO v_edited_id FROM deliverable_types WHERE slug = 'edited_video';

  INSERT INTO client_credit_balances (client_id, deliverable_type_id)
  SELECT c.id, v_edited_id
  FROM clients c
  WHERE NOT EXISTS (
    SELECT 1 FROM client_credit_balances b
    WHERE b.client_id = c.id AND b.deliverable_type_id = v_edited_id
  )
  ON CONFLICT (client_id, deliverable_type_id) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- 10. RLS: existing policies on client_credit_balances + credit_transactions
--     remain valid (they don't reference the new column). New table
--     deliverable_types is read-only public-ish (any authenticated user).
-- -----------------------------------------------------------------------------

ALTER TABLE deliverable_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_deliverable_types ON deliverable_types;
CREATE POLICY read_deliverable_types ON deliverable_types FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS admin_all_deliverable_types ON deliverable_types;
CREATE POLICY admin_all_deliverable_types ON deliverable_types FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
                 AND users.role IN ('admin', 'super_admin')));

-- =============================================================================
-- end of 221_deliverables_v1.sql
-- =============================================================================

COMMIT;
