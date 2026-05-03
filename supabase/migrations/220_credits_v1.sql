-- =============================================================================
-- 220_credits_v1.sql
-- Credits feature v1: monthly allowances, approval-as-consumption, top-up packs.
-- Spec: tasks/credits-spec.md
-- PRD:  tasks/prd-credits.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS client_credit_balances (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  current_balance INTEGER NOT NULL DEFAULT 0,
  monthly_allowance INTEGER NOT NULL DEFAULT 0,
  rollover_policy TEXT NOT NULL DEFAULT 'none'
    CHECK (rollover_policy IN ('none', 'cap', 'unlimited')),
  rollover_cap INTEGER,
  period_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  next_reset_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  -- Snapshot of current_balance immediately after the most recent reset's grant.
  -- Used by the reconciliation cron to compute expected balance without re-summing
  -- the whole ledger.
  opening_balance_at_period_start INTEGER NOT NULL DEFAULT 0,
  -- Pause flags
  auto_grant_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  paused_until TIMESTAMPTZ,
  pause_reason TEXT,
  -- Email idempotency stamps (per-period)
  low_balance_email_sent_at TIMESTAMPTZ,
  low_balance_email_period_id TEXT,
  overdraft_email_sent_at TIMESTAMPTZ,
  overdraft_email_period_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (rollover_policy != 'cap' OR rollover_cap IS NOT NULL),
  CHECK (paused_until IS NULL OR pause_reason IS NOT NULL)
);

COMMENT ON TABLE client_credit_balances IS
  'One row per client. Live balance, allowance, period dates, rollover config, '
  'pause flags, and per-period email idempotency stamps. CASCADE on client delete.';

COMMENT ON COLUMN client_credit_balances.opening_balance_at_period_start IS
  'Snapshot of current_balance immediately after the most recent reset''s grant. '
  'Reconciliation cron formula: opening + sum(deltas since period_started_at).';

COMMENT ON COLUMN client_credit_balances.auto_grant_enabled IS
  'When false, the cron skips this client indefinitely. Used for churned, free-tier, '
  'or demo accounts. Stripe top-ups still work regardless.';

COMMENT ON COLUMN client_credit_balances.paused_until IS
  'Optional time-bounded pause. Cron skips while now() < paused_until.';

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE SET NULL: audit log survives client deletion.
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'grant_monthly',
    'grant_topup',
    'consume',
    'refund',
    'adjust',
    'expire'
  )),
  delta INTEGER NOT NULL,
  -- Charge unit (set on consume + refund rows; null elsewhere)
  charge_unit_kind TEXT CHECK (charge_unit_kind IN ('drop_video', 'scheduled_post')),
  charge_unit_id UUID,
  scheduled_post_id UUID,
  -- Refund link: on `refund` rows, FK to the `consume` row this neutralises
  refund_for_id UUID REFERENCES credit_transactions(id) ON DELETE SET NULL,
  -- Source metadata
  share_link_id UUID,
  reviewer_email TEXT,
  stripe_payment_intent TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  -- Informational label (e.g. consume:dv:<id>:cycle:<n>). Dedup is state-based
  -- for consume/refund (live ledger query), key-based for grant_topup/expire
  -- (partial UNIQUE index below).
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Charge-unit shape constraint: consume/refund rows MUST have a charge unit.
  CHECK (
    (kind IN ('consume', 'refund') AND charge_unit_kind IS NOT NULL AND charge_unit_id IS NOT NULL)
    OR
    (kind NOT IN ('consume', 'refund'))
  ),
  -- Refund-link shape constraint: refund rows MUST have refund_for_id.
  CHECK ((kind = 'refund') = (refund_for_id IS NOT NULL))
);

COMMENT ON TABLE credit_transactions IS
  'Append-only audit log of every credit movement. Consume + refund use state-based '
  'dedup via refund_for_id join, NOT idempotency_key. Top-ups + expires use the '
  'partial UNIQUE index on idempotency_key.';

-- -----------------------------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------------------------

-- Cron scan: paused-aware, zero-allowance-aware.
CREATE INDEX IF NOT EXISTS idx_balances_next_reset
  ON client_credit_balances(next_reset_at)
  WHERE auto_grant_enabled IS TRUE AND monthly_allowance > 0;

-- Same scan but for the lightweight "advance period dates only" pass for
-- zero-allowance rows (so per-period email stamps still reset).
CREATE INDEX IF NOT EXISTS idx_balances_next_reset_zero_allowance
  ON client_credit_balances(next_reset_at)
  WHERE auto_grant_enabled IS TRUE AND monthly_allowance = 0;

-- Transaction history UI.
CREATE INDEX IF NOT EXISTS idx_credit_tx_client_created
  ON credit_transactions(client_id, created_at DESC);

-- State-based dedup for consume/refund: "is there an unrefunded consume on
-- this charge unit?"
CREATE INDEX IF NOT EXISTS idx_credit_tx_charge_unit
  ON credit_transactions(charge_unit_kind, charge_unit_id, created_at DESC)
  WHERE charge_unit_kind IS NOT NULL;

-- Refund-for join (so the "is this consume already refunded" check is fast).
CREATE INDEX IF NOT EXISTS idx_credit_tx_refund_for
  ON credit_transactions(refund_for_id)
  WHERE refund_for_id IS NOT NULL;

-- Scheduled-post audit lookup.
CREATE INDEX IF NOT EXISTS idx_credit_tx_scheduled_post
  ON credit_transactions(scheduled_post_id)
  WHERE scheduled_post_id IS NOT NULL;

-- Partial UNIQUE: backs Stripe webhook dedup. Consume/refund rows are excluded
-- (they use state-based dedup).
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_tx_idempotency_key_unique
  ON credit_transactions(idempotency_key)
  WHERE kind IN ('grant_topup', 'expire')
    AND idempotency_key IS NOT NULL;

-- Stripe-payment-intent lookup for refund/dispute claw-back.
CREATE INDEX IF NOT EXISTS idx_credit_tx_stripe_pi
  ON credit_transactions(stripe_payment_intent)
  WHERE stripe_payment_intent IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Webhook events log (forensic)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  verified BOOLEAN NOT NULL,
  rejection_reason TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE webhook_events IS
  'Forensic log of every credits-relevant Stripe webhook event. UNIQUE on '
  'stripe_event_id blocks re-delivery from writing to the ledger twice.';

CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON webhook_events(received_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Ledger gap detection (read-only output of the reconciliation cron)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS credit_ledger_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_balance INTEGER NOT NULL,
  actual_balance INTEGER NOT NULL,
  drift INTEGER GENERATED ALWAYS AS (actual_balance - expected_balance) STORED,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT
);

COMMENT ON TABLE credit_ledger_gaps IS
  'One row per detected drift between current_balance and the ledger sum. The '
  'reconciliation cron writes here; auto-correction is intentionally NOT done.';

CREATE INDEX IF NOT EXISTS idx_ledger_gaps_open
  ON credit_ledger_gaps(detected_at DESC)
  WHERE resolved_at IS NULL;

-- -----------------------------------------------------------------------------
-- 5. Failed email attempts (one-click resend from daily digest)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS failed_email_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  template TEXT NOT NULL,
  period_id TEXT,
  recipients TEXT[] NOT NULL,
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_failed_email_open
  ON failed_email_attempts(attempted_at DESC)
  WHERE resolved_at IS NULL;

-- -----------------------------------------------------------------------------
-- 6. RPCs
-- -----------------------------------------------------------------------------

-- consume_credit: state-based dedup. If there's an unrefunded consume row for
-- this charge unit, no-op. Otherwise insert a consume row + decrement balance.
CREATE OR REPLACE FUNCTION consume_credit(
  p_client_id UUID,
  p_charge_unit_kind TEXT,
  p_charge_unit_id UUID,
  p_scheduled_post_id UUID DEFAULT NULL,
  p_share_link_id UUID DEFAULT NULL,
  p_reviewer_email TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
  v_existing_consume_id UUID;
  v_cycle INTEGER;
  v_tx_id UUID;
BEGIN
  IF p_charge_unit_kind NOT IN ('drop_video', 'scheduled_post') THEN
    RAISE EXCEPTION 'invalid charge_unit_kind: %', p_charge_unit_kind;
  END IF;

  -- Lock the balance row so concurrent fires serialise.
  SELECT current_balance INTO v_balance
  FROM client_credit_balances
  WHERE client_id = p_client_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'no credit balance row for client %', p_client_id;
  END IF;

  -- Live ledger query: is there an unrefunded consume on this charge unit?
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
    client_id, kind, delta,
    charge_unit_kind, charge_unit_id, scheduled_post_id,
    share_link_id, reviewer_email,
    idempotency_key
  ) VALUES (
    p_client_id, 'consume', -1,
    p_charge_unit_kind, p_charge_unit_id, p_scheduled_post_id,
    p_share_link_id, p_reviewer_email,
    'consume:' || CASE p_charge_unit_kind WHEN 'drop_video' THEN 'dv' ELSE 'sp' END
      || ':' || p_charge_unit_id::text || ':cycle:' || (v_cycle + 1)::text
  ) RETURNING id INTO v_tx_id;

  UPDATE client_credit_balances
  SET current_balance = current_balance - 1,
      updated_at = now()
  WHERE client_id = p_client_id;

  RETURN jsonb_build_object(
    'consumed', true,
    'tx_id', v_tx_id,
    'new_balance', v_balance - 1
  );
END;
$$;

-- refund_credit: state-based dedup mirror of consume_credit.
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
  -- Find the most recent unrefunded consume.
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
    -- Orphan consume (client deleted). Don't touch balance, just log a refund row.
    INSERT INTO credit_transactions (
      client_id, kind, delta,
      charge_unit_kind, charge_unit_id, scheduled_post_id,
      refund_for_id, note,
      idempotency_key
    ) VALUES (
      NULL, 'refund', 1,
      p_charge_unit_kind, p_charge_unit_id, v_consume_row.scheduled_post_id,
      v_consume_row.id, COALESCE(p_note, 'orphan refund (client deleted)'),
      'refund:' || v_consume_row.id::text
    ) RETURNING id INTO v_tx_id;
    RETURN jsonb_build_object('refunded', true, 'tx_id', v_tx_id, 'orphan', true);
  END IF;

  -- Lock the live balance row.
  PERFORM 1 FROM client_credit_balances
  WHERE client_id = v_consume_row.client_id
  FOR UPDATE;

  INSERT INTO credit_transactions (
    client_id, kind, delta,
    charge_unit_kind, charge_unit_id, scheduled_post_id,
    refund_for_id, note,
    idempotency_key
  ) VALUES (
    v_consume_row.client_id, 'refund', 1,
    p_charge_unit_kind, p_charge_unit_id, v_consume_row.scheduled_post_id,
    v_consume_row.id, p_note,
    'refund:' || v_consume_row.id::text
  ) RETURNING id INTO v_tx_id;

  UPDATE client_credit_balances
  SET current_balance = current_balance + 1,
      updated_at = now()
  WHERE client_id = v_consume_row.client_id
  RETURNING current_balance INTO v_new_balance;

  RETURN jsonb_build_object(
    'refunded', true,
    'tx_id', v_tx_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- grant_credit: admin manual + Stripe top-ups. Key-based dedup (the partial
-- UNIQUE index on idempotency_key handles double-fires).
CREATE OR REPLACE FUNCTION grant_credit(
  p_client_id UUID,
  p_kind TEXT,
  p_delta INTEGER,
  p_idempotency_key TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_stripe_payment_intent TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx_id UUID;
  v_new_balance INTEGER;
BEGIN
  IF p_kind NOT IN ('grant_topup', 'adjust') THEN
    RAISE EXCEPTION 'invalid grant kind: %', p_kind;
  END IF;
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'delta cannot be zero';
  END IF;

  PERFORM 1 FROM client_credit_balances
  WHERE client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no credit balance row for client %', p_client_id;
  END IF;

  BEGIN
    INSERT INTO credit_transactions (
      client_id, kind, delta,
      stripe_payment_intent, actor_user_id, note,
      idempotency_key
    ) VALUES (
      p_client_id, p_kind, p_delta,
      p_stripe_payment_intent, p_actor_user_id, p_note,
      p_idempotency_key
    ) RETURNING id INTO v_tx_id;
  EXCEPTION WHEN unique_violation THEN
    -- Partial UNIQUE on idempotency_key (only for grant_topup) caught a re-fire.
    RETURN jsonb_build_object('already_granted', true);
  END;

  UPDATE client_credit_balances
  SET current_balance = current_balance + p_delta,
      updated_at = now()
  WHERE client_id = p_client_id
  RETURNING current_balance INTO v_new_balance;

  RETURN jsonb_build_object(
    'granted', true,
    'tx_id', v_tx_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- expire_credit: Stripe refund / dispute claw-back. Negative delta + key-based
-- dedup via the same partial UNIQUE index.
CREATE OR REPLACE FUNCTION expire_credit(
  p_client_id UUID,
  p_delta INTEGER,
  p_idempotency_key TEXT,
  p_note TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx_id UUID;
  v_new_balance INTEGER;
BEGIN
  IF p_delta >= 0 THEN
    RAISE EXCEPTION 'expire delta must be negative, got %', p_delta;
  END IF;

  PERFORM 1 FROM client_credit_balances
  WHERE client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no credit balance row for client %', p_client_id;
  END IF;

  BEGIN
    INSERT INTO credit_transactions (
      client_id, kind, delta, note, idempotency_key
    ) VALUES (
      p_client_id, 'expire', p_delta, p_note, p_idempotency_key
    ) RETURNING id INTO v_tx_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('already_expired', true);
  END;

  UPDATE client_credit_balances
  SET current_balance = current_balance + p_delta,
      updated_at = now()
  WHERE client_id = p_client_id
  RETURNING current_balance INTO v_new_balance;

  RETURN jsonb_build_object(
    'expired', true,
    'tx_id', v_tx_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- monthly_reset_for_client: at-least-once safe (re-checks next_reset_at inside
-- the lock). Honors rollover_policy. Snapshots opening_balance_at_period_start.
CREATE OR REPLACE FUNCTION monthly_reset_for_client(
  p_client_id UUID
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
  FOR UPDATE;

  IF v_row.client_id IS NULL THEN
    RETURN jsonb_build_object('not_found', true);
  END IF;

  -- At-least-once safety: a second invocation sees next_reset_at advanced.
  IF v_row.next_reset_at > now() THEN
    RETURN jsonb_build_object('already_reset', true);
  END IF;

  IF NOT v_row.auto_grant_enabled
     OR (v_row.paused_until IS NOT NULL AND v_row.paused_until > now()) THEN
    RETURN jsonb_build_object('skipped_paused', true);
  END IF;

  v_new_period_started_at := v_row.period_started_at + INTERVAL '1 month';
  v_new_period_ends_at := v_new_period_started_at + INTERVAL '1 month';

  -- Zero-allowance: advance period dates only, no ledger row.
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
    WHERE client_id = p_client_id;
    RETURN jsonb_build_object('zero_allowance_advanced', true);
  END IF;

  -- Rollover math.
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

  -- If overdraft, grant full allowance ON TOP of negative balance.
  IF v_row.current_balance < 0 THEN
    v_new_balance := v_row.current_balance + v_row.monthly_allowance;
  END IF;

  v_grant_delta := v_new_balance - v_row.current_balance;

  INSERT INTO credit_transactions (
    client_id, kind, delta, note,
    idempotency_key
  ) VALUES (
    p_client_id, 'grant_monthly', v_grant_delta,
    'monthly reset (' || v_row.rollover_policy || ')',
    'grant_monthly:' || p_client_id::text || ':' || v_new_period_started_at::date::text
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
  WHERE client_id = p_client_id;

  RETURN jsonb_build_object(
    'reset', true,
    'tx_id', v_tx_id,
    'grant_delta', v_grant_delta,
    'new_balance', v_new_balance
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. BEFORE DELETE trigger on scheduled_posts: cascade-refund any unrefunded
-- consume on this post's charge unit.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_scheduled_posts_refund_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_drop_video_id UUID;
BEGIN
  -- Resolve charge unit: prefer drop_video.
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
-- 8. Backfill: one row per existing client, allowance 0, balance 0
-- -----------------------------------------------------------------------------

INSERT INTO client_credit_balances (client_id)
SELECT id FROM clients
WHERE id NOT IN (SELECT client_id FROM client_credit_balances)
ON CONFLICT (client_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 9. RLS
-- -----------------------------------------------------------------------------

ALTER TABLE client_credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_email_attempts ENABLE ROW LEVEL SECURITY;

-- Admin (admin + super_admin): full access on everything.
DROP POLICY IF EXISTS admin_all_balances ON client_credit_balances;
CREATE POLICY admin_all_balances ON client_credit_balances FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
                 AND users.role IN ('admin', 'super_admin')));

DROP POLICY IF EXISTS admin_all_transactions ON credit_transactions;
CREATE POLICY admin_all_transactions ON credit_transactions FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
                 AND users.role IN ('admin', 'super_admin')));

DROP POLICY IF EXISTS admin_all_webhook_events ON webhook_events;
CREATE POLICY admin_all_webhook_events ON webhook_events FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
                 AND users.role IN ('admin', 'super_admin')));

DROP POLICY IF EXISTS admin_all_ledger_gaps ON credit_ledger_gaps;
CREATE POLICY admin_all_ledger_gaps ON credit_ledger_gaps FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
                 AND users.role IN ('admin', 'super_admin')));

DROP POLICY IF EXISTS admin_all_failed_emails ON failed_email_attempts;
CREATE POLICY admin_all_failed_emails ON failed_email_attempts FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
                 AND users.role IN ('admin', 'super_admin')));

-- Viewer (portal): SELECT-only on their own client's balance + transactions.
DROP POLICY IF EXISTS viewer_read_own_balance ON client_credit_balances;
CREATE POLICY viewer_read_own_balance ON client_credit_balances FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_client_access uca
    WHERE uca.user_id = auth.uid()
      AND uca.client_id = client_credit_balances.client_id
  ));

DROP POLICY IF EXISTS viewer_read_own_transactions ON credit_transactions;
CREATE POLICY viewer_read_own_transactions ON credit_transactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_client_access uca
    WHERE uca.user_id = auth.uid()
      AND uca.client_id = credit_transactions.client_id
  ));

-- =============================================================================
-- end of 220_credits_v1.sql
-- =============================================================================
