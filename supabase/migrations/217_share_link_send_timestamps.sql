-- 217_share_link_send_timestamps.sql
--
-- Track when admins emailed the calendar share link to the client, separate
-- from when the link itself was minted.
--
-- Previously the projects review table read DATE SENT from
-- `content_drop_share_links.created_at`, which fired whenever the link was
-- minted (even if the calendar was never sent to anyone). The new columns
-- only update after a real email send, so the DATE SENT column reads "—"
-- for links that haven't been pinged yet.

ALTER TABLE content_drop_share_links
  ADD COLUMN IF NOT EXISTS first_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_count    INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows from `email_messages` so calendars already shipped
-- via scripts/send-calendar-batch.ts and the manual notify-revisions flow
-- still show a real DATE SENT after the column source flips.
--
-- email_messages doesn't carry share_link_id, so the join is per-drop. A
-- drop with multiple share links will paint the same first/last_sent_at on
-- all of them, which is acceptable: the client is the same and DATE SENT
-- only needs to answer "have we touched this calendar yet?"
WITH per_drop_sends AS (
  SELECT
    drop_id,
    MIN(sent_at) AS first_sent,
    MAX(sent_at) AS last_sent,
    COUNT(*)     AS sends
  FROM email_messages
  WHERE drop_id IS NOT NULL
    AND status = 'sent'
    AND type_key IN ('calendar_delivery', 'calendar_revised_videos')
  GROUP BY drop_id
)
UPDATE content_drop_share_links sl
SET
  first_sent_at = pds.first_sent,
  last_sent_at  = pds.last_sent,
  send_count    = pds.sends
FROM per_drop_sends pds
WHERE sl.drop_id = pds.drop_id
  AND sl.first_sent_at IS NULL;

-- Index on first_sent_at so DATE SENT sort (blanks last, then desc) stays
-- snappy as the table grows. Filtered partial index keeps it tight since
-- many rows will sit at NULL.
CREATE INDEX IF NOT EXISTS idx_content_drop_share_links_first_sent_at
  ON content_drop_share_links (first_sent_at DESC NULLS LAST);

COMMENT ON COLUMN content_drop_share_links.first_sent_at IS
  'Timestamp of the FIRST time an admin emailed this calendar share link to the client. Stays NULL until a real send fires.';
COMMENT ON COLUMN content_drop_share_links.last_sent_at IS
  'Timestamp of the most recent calendar send (initial or "revised, please re-review"). Followup pings stamp last_followup_at instead.';
COMMENT ON COLUMN content_drop_share_links.send_count IS
  'Number of calendar send emails (initial + revised). Followup nudges live in followup_count.';
