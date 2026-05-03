-- =============================================================================
-- 223_consume_credit_attribution.sql
-- Phase C of the deliverables pivot: extend the consume_credit RPC so the
-- caller can stamp editor attribution + revision count + deliverable pointer
-- on the consume row. Migration 222 added the columns; this migration wires
-- the RPC to populate them.
--
-- Backwards compatible: all three new params default to NULL/0, so existing
-- callers (refund_credit, the BEFORE-DELETE trigger, anything that hasn't
-- been touched yet) keep working unchanged.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS consume_credit(
  UUID, TEXT, UUID, UUID, UUID, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION consume_credit(
  p_client_id UUID,
  p_charge_unit_kind TEXT,
  p_charge_unit_id UUID,
  p_scheduled_post_id UUID DEFAULT NULL,
  p_share_link_id UUID DEFAULT NULL,
  p_reviewer_email TEXT DEFAULT NULL,
  p_deliverable_type_slug TEXT DEFAULT 'edited_video',
  p_editor_user_id UUID DEFAULT NULL,
  p_revision_count INTEGER DEFAULT 0,
  p_deliverable_id UUID DEFAULT NULL
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

  -- Cycle counter for the human-readable label.
  SELECT COUNT(*) INTO v_cycle
  FROM credit_transactions
  WHERE charge_unit_kind = p_charge_unit_kind
    AND charge_unit_id = p_charge_unit_id
    AND kind = 'consume';

  INSERT INTO credit_transactions (
    client_id, kind, delta, deliverable_type_id,
    charge_unit_kind, charge_unit_id, scheduled_post_id,
    share_link_id, reviewer_email,
    editor_user_id, revision_count, deliverable_id,
    idempotency_key
  ) VALUES (
    p_client_id, 'consume', -1, v_type_id,
    p_charge_unit_kind, p_charge_unit_id, p_scheduled_post_id,
    p_share_link_id, p_reviewer_email,
    p_editor_user_id, COALESCE(p_revision_count, 0), p_deliverable_id,
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

COMMIT;

-- =============================================================================
-- end of 223_consume_credit_attribution.sql
-- =============================================================================
