-- ──────────────────────────────────────────────────────────────────────
-- 190: Reminder dedupe columns on content_drop_share_links
-- ──────────────────────────────────────────────────────────────────────
-- The /api/cron/calendar-reminders job nudges clients along three
-- triggers — never opened (48h), opened-but-no-action (72h), and final
-- call (24h before the earliest scheduled post in the link). Each
-- reminder fires AT MOST ONCE per share link, so we stamp the column
-- when the reminder ships and the cron filters out any share link
-- whose timestamp is non-null.
--
-- Cadence params (windowHours / hoursBeforeFirstPost) live in the
-- notification_settings.params jsonb column (see migration 189) so
-- admins can re-tune without a deploy.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE content_drop_share_links
  ADD COLUMN IF NOT EXISTS no_open_nudge_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_action_nudge_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_call_sent_at TIMESTAMPTZ;

-- Partial index to keep the cron's "needs reminder" sweep cheap.
CREATE INDEX IF NOT EXISTS idx_drop_share_links_reminders_pending
  ON content_drop_share_links (created_at)
  WHERE no_open_nudge_sent_at IS NULL
     OR no_action_nudge_sent_at IS NULL
     OR final_call_sent_at IS NULL;
