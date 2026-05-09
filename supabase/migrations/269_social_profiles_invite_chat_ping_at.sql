-- Track when the invite-completion path last fired a Google Chat ping
-- for a given social profile, so the Zernio account.connected webhook
-- can dedupe and not send a second message a few seconds later.
--
-- See `handleInviteCompletion` (sets) and the account.connected case in
-- /api/scheduler/webhooks (reads) for the dedup window (5 min).
ALTER TABLE social_profiles
  ADD COLUMN IF NOT EXISTS invite_chat_pinged_at timestamptz;

COMMENT ON COLUMN social_profiles.invite_chat_pinged_at IS
  'Timestamp of the last Google Chat ping fired by handleInviteCompletion. The Zernio account.connected webhook checks this to avoid double-pinging when a connection came through an invite link.';
