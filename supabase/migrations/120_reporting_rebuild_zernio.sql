-- 120_reporting_rebuild_zernio.sql
-- Rebuild social reporting around real Zernio endpoints.
-- Adds per-metric columns needed for the per-platform card grid and wipes
-- old snapshot data that was synthesized from post-level analytics.

ALTER TABLE platform_snapshots
  ADD COLUMN IF NOT EXISTS reach_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impressions_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_clicks_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_visits_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watch_time_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follower_growth_percent NUMERIC;

-- Wipe stale snapshot + post data across all clients so the new sync writes
-- against a clean slate. Follower-daily and post_metrics are derived from the
-- same broken pipeline.
TRUNCATE TABLE platform_snapshots RESTART IDENTITY;
TRUNCATE TABLE post_metrics RESTART IDENTITY;
TRUNCATE TABLE platform_follower_daily RESTART IDENTITY;
