-- "Client fully onboarded" notification dedup sentinel.
--
-- The scheduler webhook (account.connected) now detects the transition
-- where a client's final core platform comes online (all four of
-- facebook / instagram / tiktok / youtube now active in social_profiles).
-- When that transition happens, we emit a celebratory "Client fully
-- onboarded" card to OPS + the client's chat space.
--
-- Dedup: once stamped, we never re-fire the card for this client. If the
-- client later disconnects + reconnects a platform, that's covered by
-- the connection-expired / account.disconnected paths — the fully-onboarded
-- card is a one-time milestone, not a heartbeat.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS fully_onboarded_at timestamptz NULL;

COMMENT ON COLUMN clients.fully_onboarded_at IS
  'Set the first time all four core platforms (FB/IG/TT/YT) are simultaneously connected for this client. Drives the one-time "fully onboarded" chat notification.';
