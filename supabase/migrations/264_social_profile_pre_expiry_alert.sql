-- Track whether we've sent the pre-expiry warning (3-day window) for a
-- social profile's token. Distinct from `disconnect_alerted_at`, which
-- fires AFTER a token already went bad. The pre-expiry alert is the
-- proactive nudge that gives the team a 72h window to send the
-- reconnect invite before the token actually breaks.
--
-- Cleared (set back to NULL) by `connection-expired-watch` whenever the
-- token gets refreshed to a new expiry > 7d out, so the next cycle's
-- 3-day alert fires again for the new expiry.
ALTER TABLE social_profiles
  ADD COLUMN IF NOT EXISTS pre_expiry_alerted_at TIMESTAMPTZ;
