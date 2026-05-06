-- 256_drop_revenue_hub.sql: drop the Stripe + Revenue Hub mirror tables and
-- their satellite columns. The webhook handler will be rebuilt from scratch
-- later; this migration retires the schema that backed it.
--
-- What survives:
--   * clients.stripe_customer_id          credits checkout still uses it
--   * clients.lifecycle_state (+ check)   onboarding/deliverables/contracts use it
--   * client_contracts.external_*, total_cents, deposit_cents, sent_at, signed_at
--                                         ContractKit card surface still uses these
--   * client_contracts.deposit_invoice_id retained as plain text after FK drop;
--                                         ContractKit form references it
--   * proposals tables (155)              proposal builder is independent
--   * proposals.payment_link_deposit_cents drift guard is gone with the handler
--
-- What goes:
--   * stripe_customers, stripe_invoices, stripe_subscriptions, stripe_charges,
--     stripe_events, stripe_refunds        cascade-drop incl. dependent FKs
--   * client_ad_spend, client_lifecycle_events  both written only by the now-gone
--                                               meta-ads sync + lifecycle machine
--   * revenue_anomalies                    no detector left to populate it
--   * clients.kickoff_email_sent_at        guard for the kickoff-once flow
--   * clients.mrr_cents, boosting_budget_cents  Revenue Hub dashboard data
--   * clients.meta_ad_account_id, meta_ad_spend_synced_at  Meta Ads sync gone
--   * proposals.stripe_payment_link_id, stripe_payment_link_url, stripe_invoice_id,
--     payment_link_deposit_cents
--   * notifications.type: drop the 12 revenue-only enum values
--
-- The cascade drop on stripe_invoices auto-removes the
-- client_contracts_deposit_invoice_fk constraint (it pointed at stripe_invoices.id);
-- the deposit_invoice_id text column is left in place.

begin;

-- 1. Drop revenue-only tables (cascade catches portal_read policies + FKs).
drop table if exists revenue_anomalies cascade;
drop table if exists stripe_refunds cascade;
drop table if exists stripe_charges cascade;
drop table if exists stripe_events cascade;
drop table if exists stripe_invoices cascade;
drop table if exists stripe_subscriptions cascade;
drop table if exists stripe_customers cascade;
drop table if exists client_ad_spend cascade;
drop table if exists client_lifecycle_events cascade;

-- The set_updated_at_client_ad_spend() helper was added in 154 for that table.
drop function if exists set_updated_at_client_ad_spend() cascade;

-- 2. Drop revenue-only columns on clients. lifecycle_state and stripe_customer_id
--    intentionally stay.
alter table clients
  drop column if exists kickoff_email_sent_at,
  drop column if exists mrr_cents,
  drop column if exists boosting_budget_cents,
  drop column if exists meta_ad_account_id,
  drop column if exists meta_ad_spend_synced_at;

drop index if exists clients_meta_ad_account_idx;

-- 3. Drop revenue-only columns on proposals.
alter table proposals
  drop column if exists stripe_payment_link_id,
  drop column if exists stripe_payment_link_url,
  drop column if exists stripe_invoice_id,
  drop column if exists payment_link_deposit_cents;

-- 4. Shrink notifications.type back to the non-revenue set. Mirrors migration
--    246 minus payment_received, invoice_overdue, invoice_sent,
--    invoice_due_soon, contract_signed, subscription_*, proposal_expiring,
--    revenue_anomaly. Append-safe order preserved.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications
  add constraint notifications_type_check
  check (type = any (array[
    'general'::text,
    'report_published'::text,
    'concepts_ready'::text,
    'idea_submitted'::text,
    'feedback_received'::text,
    'preferences_updated'::text,
    'weekly_digest'::text,
    'footage_pending'::text,
    'task_assigned'::text,
    'task_due_tomorrow'::text,
    'task_overdue'::text,
    'task_completed'::text,
    'post_top_performer'::text,
    'engagement_spike'::text,
    'follower_milestone'::text,
    'sync_failed'::text,
    'post_published'::text,
    'post_failed'::text,
    'post_needs_approval'::text,
    'post_trending'::text,
    'account_disconnected'::text,
    'search_completed'::text,
    'topic_search_failed'::text,
    'topic_search_stuck'::text,
    'shoot_scheduled'::text,
    'shoot_rescheduled'::text,
    'shoot_cancelled'::text,
    'edit_status_changed'::text,
    'onboarding_milestone'::text,
    'followup_sent'::text
  ]));

commit;
