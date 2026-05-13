-- Leg-level health-alert dedup sentinel.
--
-- post-health (rescheduled 2026-05-13 to fire at 12:45 PM CT + 2:00 PM CT
-- daily) absorbed the two chat cards that used to live in
-- verify-published-posts:
--
--   * "⚠️ Post stuck in publishing" → dedup via scheduled_posts.stuck_publishing_alerted_at
--   * "❌ Post rejected by platform" → dedup via THIS column
--
-- A platform reject is a leg-level state (verification_status='platform_reject'
-- on one of N legs); the parent scheduled_posts.status stays 'published'
-- because Zernio's API initially returned success. So we can't reuse
-- scheduled_posts.health_alerted_at, which only catches parent rows whose
-- top-level status flipped to 'failed' / 'partially_failed'.
--
-- Reset behavior: nothing clears this column. A platform reject is terminal
-- per leg; the verify cron never re-probes a leg stamped 'platform_reject',
-- so a re-alert can only happen if the row's verification_status is manually
-- cleared back to 'pending' (admin intervention) and the leg gets re-rejected.

ALTER TABLE scheduled_post_platforms
  ADD COLUMN IF NOT EXISTS health_alerted_at timestamptz NULL;

COMMENT ON COLUMN scheduled_post_platforms.health_alerted_at IS
  'Set when post-health fires a leg-level platform-reject alert. Once stamped, the leg is not re-alerted unless verification_status is manually reset.';
