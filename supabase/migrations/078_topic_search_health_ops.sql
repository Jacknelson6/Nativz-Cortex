-- Topic search ops monitoring: admin notifications + dedupe columns
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'report_published', 'concepts_ready', 'idea_submitted', 'feedback_received',
  'preferences_updated', 'weekly_digest', 'footage_pending',
  'task_assigned', 'task_due_tomorrow', 'task_overdue', 'task_completed',
  'post_top_performer', 'engagement_spike', 'follower_milestone',
  'sync_failed', 'post_published', 'post_failed', 'post_trending',
  'account_disconnected',
  'search_completed',
  'topic_search_failed',
  'topic_search_stuck'
]));

ALTER TABLE topic_searches
  ADD COLUMN IF NOT EXISTS ops_failed_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ops_stuck_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN topic_searches.ops_failed_notified_at IS 'Set when admins were notified this search failed (dedupes alerts).';
COMMENT ON COLUMN topic_searches.ops_stuck_notified_at IS 'Set when admins were notified this search looked stuck (dedupes alerts).';
