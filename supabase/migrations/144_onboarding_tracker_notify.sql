-- 144_onboarding_tracker_notify.sql — per-tracker notification recipients
-- ----------------------------------------------------------------------------
-- Adds notify_emails[] on onboarding_trackers: the list of people who get
-- a Resend email whenever the client does something meaningful on the
-- public page (tick a task, upload a file, confirm a connection).
--
-- Defaults to empty array so existing trackers don't start emailing anyone.
-- Admin populates this from the editor's new Notifications card; typically
-- the onboarding manager's address.

ALTER TABLE onboarding_trackers
  ADD COLUMN IF NOT EXISTS notify_emails TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Quick GIN index so we can later find "trackers notifying X" if needed.
CREATE INDEX IF NOT EXISTS onboarding_trackers_notify_emails_idx
  ON onboarding_trackers USING GIN (notify_emails);
