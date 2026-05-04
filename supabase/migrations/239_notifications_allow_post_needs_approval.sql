-- Migration 238: allow type='post_needs_approval' in notifications.
--
-- WHY
-- The publish-cron stale-draft scan (app/api/cron/publish-posts/route.ts)
-- calls notifyAdmins({ type: 'post_needs_approval', ... }) when a drop post's
-- scheduled time passes without the client approving it. The
-- notifications.type CHECK constraint (last widened in migration 229) does
-- not list 'post_needs_approval', so every insert fails:
--
--   new row for relation "notifications" violates check constraint
--   "notifications_type_check"
--
-- The error is swallowed by the per-call try/catch in the cron handler, so
-- the cron still returns 200, but Jack never sees the bell ping for stale
-- drafts and the server log fills with constraint failures.
--
-- HOW
-- Drop the constraint and re-add it with the new type appended. The set is
-- otherwise identical to migration 229's list. Append-only widening, no
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
    'onboarding_milestone'::text
  ]));
