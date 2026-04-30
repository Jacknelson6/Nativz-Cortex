-- Migration 209: Track when ops chat has been pinged about overdue revisions.
--
-- When a client leaves changes_requested and we don't deliver the
-- revisions within the threshold, the calendar-reminders cron pings
-- ops chat (Jack) once with the brand + count + share link. Stamp
-- prevents the same overdue state from re-pinging every cron tick.
--
-- The stamp is cleared by app/api/calendar/drops/[id]/posts/[postId]/
-- revision/complete when the drop becomes clean, so the next round of
-- revision feedback can re-trigger the nudge.

ALTER TABLE content_drop_share_links
  ADD COLUMN IF NOT EXISTS revisions_ops_nudged_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN content_drop_share_links.revisions_ops_nudged_at IS
  'Set when calendar-reminders cron pings ops chat about overdue '
  'revisions on this drop. Cleared when the drop is fully revised so '
  'the next round of changes_requested can re-trigger the ping.';
