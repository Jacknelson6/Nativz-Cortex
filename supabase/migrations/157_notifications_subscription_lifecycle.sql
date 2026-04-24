-- 157_notifications_subscription_lifecycle.sql — add pause/resume/updated
-- notification types so the webhook can surface the full sub lifecycle.
begin;

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type = any (array[
  'report_published', 'concepts_ready', 'idea_submitted', 'feedback_received',
  'preferences_updated', 'weekly_digest', 'footage_pending',
  'task_assigned', 'task_due_tomorrow', 'task_overdue', 'task_completed',
  'post_top_performer', 'engagement_spike', 'follower_milestone',
  'sync_failed', 'post_published', 'post_failed', 'post_trending',
  'account_disconnected',
  'search_completed',
  'topic_search_failed',
  'topic_search_stuck',
  'payment_received',
  'invoice_overdue',
  'invoice_sent',
  'invoice_due_soon',
  'contract_signed',
  'subscription_created',
  'subscription_canceled',
  'subscription_paused',
  'subscription_resumed',
  'subscription_updated'
]));

commit;
