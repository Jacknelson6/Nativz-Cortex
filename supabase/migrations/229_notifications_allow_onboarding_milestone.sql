-- Migration 229: allow type='onboarding_milestone' in notifications.
--
-- WHY
-- Phase 5 of the onboarding rebuild added admin in-app notifications when
-- a client crosses a milestone in the stepper (lib/onboarding/milestones.ts).
-- It calls notifyAdmins({ type: 'onboarding_milestone', ... }) but the
-- notifications.type CHECK constraint (last widened in migration 181) does
-- not list 'onboarding_milestone', so every insert fails:
--
--   new row for relation "notifications" violates check constraint
--   "notifications_type_check"
--
-- The error is swallowed by the per-call .catch() in notifyMilestones, so
-- the user-facing PATCH still succeeds, but admins never see milestone
-- notifications and the server log fills with constraint failures.
--
-- HOW
-- Drop the constraint and re-add it with the new type appended. The set is
-- otherwise identical to migration 181's list. Append-only widening, no
-- existing rows are affected.

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
    'onboarding_milestone'::text
  ]));
