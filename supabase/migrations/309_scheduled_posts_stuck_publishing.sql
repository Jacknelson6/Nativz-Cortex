-- Stuck-publishing alert dedup sentinel.
--
-- publish-posts flips a row to 'publishing' via CAS, then calls Zernio. If
-- the process is killed mid-call (OOM, Vercel timeout, hung HTTP), the row
-- stays 'publishing' forever. The next cron tick's SELECT re-claims it via
-- CAS, so it self-heals on retry. But if it crashes repeatedly (deterministic
-- payload bug, Zernio outage), there's no alert.
--
-- verify-published-posts now scans for `status='publishing' AND scheduled_at
-- < now() - 15min` and fires one Chat alert per stuck row. Dedup via this
-- column. publish-posts clears it on the next successful publish so a
-- caption-edit + republish that gets stuck again can re-page.

ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS stuck_publishing_alerted_at timestamptz NULL;

COMMENT ON COLUMN scheduled_posts.stuck_publishing_alerted_at IS
  'Set when verify-published-posts fires a stuck-publishing alert for this row. Cleared by publish-posts on next successful publish.';
