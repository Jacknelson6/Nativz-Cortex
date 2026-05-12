-- Anti-flap dedup: track when a previously-alerted social_profile first
-- read healthy again. Only clear `disconnect_alerted_at` after sustained
-- healthy (>24h) so a single transient good probe from Zernio doesn't
-- unlock the alert and let publish-posts re-fire on the next bad read.
ALTER TABLE public.social_profiles
  ADD COLUMN IF NOT EXISTS disconnect_healthy_since TIMESTAMPTZ;

COMMENT ON COLUMN public.social_profiles.disconnect_healthy_since IS
  'Timestamp of first healthy probe after a disconnect_alerted_at stamp. Reset to NULL whenever token returns to bad. connection-expired-watch only clears disconnect_alerted_at when (now - disconnect_healthy_since) > 24h, suppressing flap-driven re-alerts.';
