-- Dedup columns for the post-health cron at /api/cron/post-health.
-- The cron alerts Jack on (a) failed posts and (b) disconnected social accounts.
-- These columns let us mark "already alerted" so a single failure or disconnect
-- only fires one fan-out (email + Google Chat + in-app) instead of every 30 min.

ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS health_alerted_at TIMESTAMPTZ;

ALTER TABLE social_profiles
  ADD COLUMN IF NOT EXISTS disconnect_alerted_at TIMESTAMPTZ;

-- Partial index so the cron's "find new failures" query is cheap even when
-- the table grows. Only failed/partially_failed rows are interesting.
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_health_alert
  ON scheduled_posts (status, health_alerted_at)
  WHERE status IN ('failed', 'partially_failed');
