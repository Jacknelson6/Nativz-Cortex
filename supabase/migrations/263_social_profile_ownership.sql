-- Track who actually owns each social account on file: did the client
-- create it themselves, or did Nativz spin it up on their behalf?
--
-- Drives reconnect-notification routing: if Nativz created the account,
-- we never want a "your authorization expired" email going to the
-- client (it makes us look disorganized — they didn't create it). The
-- cron pings the ops Google Chat instead so the team can fix it
-- internally or hand-send an invite from the matrix.
--
-- Default 'unknown' so legacy rows surface as a backlog to triage in
-- the Connections matrix; nothing flips behavior until an admin marks
-- the row as 'agency' or 'client'.

ALTER TABLE social_profiles
  ADD COLUMN IF NOT EXISTS account_owner TEXT
    NOT NULL
    DEFAULT 'unknown'
    CHECK (account_owner IN ('agency', 'client', 'unknown'));

CREATE INDEX IF NOT EXISTS social_profiles_account_owner_idx
  ON social_profiles (account_owner);

COMMENT ON COLUMN social_profiles.account_owner IS
  'Who created the underlying social account: agency (Nativz spun it up), client (client did), unknown (legacy / not yet triaged). Drives reconnect-notification routing.';
