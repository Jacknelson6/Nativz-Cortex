-- Allow `type = 'general'` in notifications.
-- The content-calendar share-link comment route fires
-- createNotification({ type: 'general', ... }) for every admin recipient
-- (app/api/calendar/share/[token]/comment/route.ts), but the CHECK constraint
-- only listed feature-specific types. Each comment was producing a silent
-- "Failed to create notification" log line and admins received nothing.
--
-- 'general' is the documented fallback type for cross-feature notifications
-- without a domain-specific bucket; widen the constraint so it inserts cleanly.

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
    'edit_status_changed'::text
  ]));
