-- Migration 246: allow type='followup_sent' in notifications.
--
-- WHY
-- The unified follow-up cadence (migration 245) fires automated reminders
-- on both surfaces (calendar + editing) at T+72h / T+120h / T+168h. Each
-- send drops an in-app Cortex notification so the team can see "We sent
-- follow-up N to {client}" alongside the email log + ops chat ping.
--
-- HOW
-- Append `followup_sent` to the existing notifications.type CHECK
-- constraint (last widened in migration 239). Append-only widening, no
-- existing rows affected.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
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
    'payment_received'::text,
    'invoice_overdue'::text,
    'invoice_sent'::text,
    'invoice_due_soon'::text,
    'contract_signed'::text,
    'subscription_created'::text,
    'subscription_canceled'::text,
    'subscription_paused'::text,
    'subscription_resumed'::text,
    'subscription_updated'::text,
    'proposal_expiring'::text,
    'revenue_anomaly'::text,
    'shoot_scheduled'::text,
    'shoot_rescheduled'::text,
    'shoot_cancelled'::text,
    'edit_status_changed'::text,
    'onboarding_milestone'::text,
    'followup_sent'::text
  ]));
