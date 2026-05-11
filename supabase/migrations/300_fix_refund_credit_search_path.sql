-- Two related broken functions were blocking every scheduled_posts
-- DELETE in production with errors like "relation credit_transactions
-- does not exist" / "relation content_drop_videos does not exist".
--
-- Root cause: both functions used SET search_path TO 'public, pg_temp'
-- (single-quoted form) which did not consistently resolve unqualified
-- table references at execution time. The fix: keep the hardened
-- search_path but fully qualify every table reference inside the
-- function bodies so resolution is unambiguous.
--
-- Applied directly to prod 2026-05-11 while cleaning up Avondale's
-- 5 AM CDT double-posts. This migration is the on-disk record.

CREATE OR REPLACE FUNCTION public.refund_credit(p_charge_unit_kind text, p_charge_unit_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, pg_temp'
AS $function$
DECLARE v_consume_row public.credit_transactions%ROWTYPE; v_tx_id UUID; v_new_balance INTEGER;
BEGIN
  SELECT c.* INTO v_consume_row FROM public.credit_transactions c
  WHERE c.charge_unit_kind = p_charge_unit_kind AND c.charge_unit_id = p_charge_unit_id
    AND c.kind = 'consume'
    AND NOT EXISTS (SELECT 1 FROM public.credit_transactions r WHERE r.refund_for_id = c.id AND r.kind = 'refund')
  ORDER BY c.created_at DESC LIMIT 1 FOR UPDATE;
  IF v_consume_row.id IS NULL THEN RETURN jsonb_build_object('no_consume_to_refund', true); END IF;
  IF v_consume_row.client_id IS NULL THEN
    INSERT INTO public.credit_transactions (client_id, kind, delta, deliverable_type_id,
      charge_unit_kind, charge_unit_id, scheduled_post_id, refund_for_id, note, idempotency_key)
    VALUES (NULL, 'refund', 1, v_consume_row.deliverable_type_id, p_charge_unit_kind,
      p_charge_unit_id, v_consume_row.scheduled_post_id, v_consume_row.id,
      COALESCE(p_note, 'orphan refund (client deleted)'), 'refund:' || v_consume_row.id::text)
    RETURNING id INTO v_tx_id;
    RETURN jsonb_build_object('refunded', true, 'tx_id', v_tx_id, 'orphan', true);
  END IF;
  PERFORM 1 FROM public.client_credit_balances
  WHERE client_id = v_consume_row.client_id AND deliverable_type_id = v_consume_row.deliverable_type_id FOR UPDATE;
  INSERT INTO public.credit_transactions (client_id, kind, delta, deliverable_type_id,
    charge_unit_kind, charge_unit_id, scheduled_post_id, refund_for_id, note, idempotency_key)
  VALUES (v_consume_row.client_id, 'refund', 1, v_consume_row.deliverable_type_id,
    p_charge_unit_kind, p_charge_unit_id, v_consume_row.scheduled_post_id, v_consume_row.id,
    p_note, 'refund:' || v_consume_row.id::text) RETURNING id INTO v_tx_id;
  UPDATE public.client_credit_balances SET current_balance = current_balance + 1, updated_at = now()
  WHERE client_id = v_consume_row.client_id AND deliverable_type_id = v_consume_row.deliverable_type_id
  RETURNING current_balance INTO v_new_balance;
  RETURN jsonb_build_object('refunded', true, 'tx_id', v_tx_id, 'new_balance', v_new_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_scheduled_posts_refund_credit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE v_drop_video_id UUID;
BEGIN
  SELECT id INTO v_drop_video_id FROM public.content_drop_videos
  WHERE scheduled_post_id = OLD.id LIMIT 1;
  IF v_drop_video_id IS NOT NULL THEN
    PERFORM public.refund_credit('drop_video', v_drop_video_id,
      'scheduled_post deleted (id=' || OLD.id::text || ')');
  ELSE
    PERFORM public.refund_credit('scheduled_post', OLD.id, 'scheduled_post deleted');
  END IF;
  RETURN OLD;
END;
$function$;
