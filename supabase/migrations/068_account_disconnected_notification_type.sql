-- Allow social account disconnect alerts from Zernio webhooks
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'report_published', 'concepts_ready', 'idea_submitted', 'feedback_received',
  'preferences_updated', 'weekly_digest', 'footage_pending',
  'task_assigned', 'task_due_tomorrow', 'task_overdue', 'task_completed',
  'post_top_performer', 'engagement_spike', 'follower_milestone',
  'sync_failed', 'post_published', 'post_failed', 'post_trending',
  'account_disconnected'
]));
