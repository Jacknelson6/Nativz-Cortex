-- Dedup partial-failure notifications.
--
-- The publish-posts cron sends a "partial failure" admin alert when a post
-- exhausts MAX_RETRIES with at least one failed leg. Two parallel cron
-- workers (Vercel can fire ticks back-to-back when a previous tick lingers)
-- can both terminal-fail the same post and both notify, producing duplicate
-- bell items 20-30s apart for the same caption + platform. The CAS on
-- updated_at prevents simultaneous reads but not back-to-back claims.
--
-- This column is set the first time we notify for a given terminal-failure
-- transition. The notify helper checks it and short-circuits if already set.
-- Cleared on the next successful publish (so a future failure on the same
-- post can still page us).

ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS failure_notification_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN scheduled_posts.failure_notification_sent_at IS
  'Set when the publish cron fires a terminal partial-failure notification. Used to dedup back-to-back cron ticks. Cleared on successful (re-)publish.';
