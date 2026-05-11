-- Migration 303: monthly_calendar_post_count on clients
--
-- Drives the monthly calendar cron (TBD): on the 1st of each month,
-- for every active SMM client with monthly_calendar_post_count > 0,
-- generate next month's content calendar project pre-populated with N
-- empty post slots. Editors fill in final videos; videographers add
-- raw footage + notes.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS monthly_calendar_post_count INTEGER NOT NULL DEFAULT 0
    CHECK (monthly_calendar_post_count >= 0 AND monthly_calendar_post_count <= 1000);

COMMENT ON COLUMN clients.monthly_calendar_post_count IS
  'Number of post slots to pre-create when the monthly calendar cron '
  'spins up a new content calendar project for this client on the 1st '
  'of each month. 0 means "do not auto-generate" (the default). '
  'Only consulted when services contains ''SMM'' and the client is '
  'active + not paused.';
