-- Migration 216: 48-hour shoot brief reminder cron support.
--
-- A new daily cron (`/api/cron/shoot-brief-reminders`) emails every team
-- member listed as an attendee on a Google Calendar shoot ~48 hours before
-- the shoot fires, prompting them to write a brief in Content Lab.
--
-- Two columns get added to `shoot_events`:
--
--   `attendee_emails`        snapshot of the calendar attendees at sync
--                            time. We snapshot instead of re-fetching the
--                            Google event in the cron because the sync
--                            route already has a service-account token in
--                            hand and the cron should stay cheap.
--
--   `brief_reminder_sent_at` idempotency guard. The cron's lookahead
--                            window (36-60h from now) overlaps two daily
--                            runs for shoots in the middle of the band, so
--                            we skip rows that already fired.

ALTER TABLE shoot_events
  ADD COLUMN IF NOT EXISTS attendee_emails        TEXT[]      DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS brief_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN shoot_events.attendee_emails IS
  'Lowercased emails of calendar attendees, snapshotted from Google at sync time. Matched against team_members.email by the brief-reminder cron.';

COMMENT ON COLUMN shoot_events.brief_reminder_sent_at IS
  'Set by /api/cron/shoot-brief-reminders to prevent duplicate sends across overlapping daily runs.';
