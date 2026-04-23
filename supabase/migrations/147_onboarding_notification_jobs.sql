-- 147_onboarding_notification_jobs.sql — batch manager notifications
-- ----------------------------------------------------------------------------
-- Coalesces bursts of client activity into a single email. When a client
-- ticks 6 tasks in 30 seconds, the manager gets ONE email summarising all 6
-- instead of 6 separate ones.
--
-- Design:
--   - One row per (tracker_id) that has pending notifications
--   - `events` is a JSONB array of {kind, detail, at} entries
--   - `scheduled_for` is the earliest time we can flush this tracker's queue
--   - A cron runs every minute, SELECTs where scheduled_for <= now(), sends
--     one batched email per tracker, then deletes the row
--
-- UNIQUE constraint on tracker_id means new events for the same tracker
-- just append to the existing row via UPDATE.

CREATE TABLE IF NOT EXISTS onboarding_notification_jobs (
  tracker_id UUID PRIMARY KEY REFERENCES onboarding_trackers(id) ON DELETE CASCADE,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_for TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_notification_jobs_due_idx
  ON onboarding_notification_jobs (scheduled_for);

ALTER TABLE onboarding_notification_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_notification_jobs admin all" ON onboarding_notification_jobs;
CREATE POLICY "onboarding_notification_jobs admin all"
  ON onboarding_notification_jobs FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

DROP TRIGGER IF EXISTS onboarding_notification_jobs_set_updated_at ON onboarding_notification_jobs;
CREATE TRIGGER onboarding_notification_jobs_set_updated_at
  BEFORE UPDATE ON onboarding_notification_jobs
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();
