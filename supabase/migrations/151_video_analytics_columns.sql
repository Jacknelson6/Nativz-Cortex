-- Adds video-specific analytics columns so we can store YouTube watch
-- time and retention metrics per-post. Zernio exposes these via
-- /analytics/youtube/daily-views?videoId=X (NOT the standard /analytics
-- endpoint). TikTok's equivalent is not exposed by Zernio — those
-- columns stay null for TikTok rows for now; a direct TikTok Research
-- API integration would be needed to fill them.
--
-- avg_view_duration is stored in seconds (what Zernio returns as
-- averageViewDuration in the daily-views payload).
-- watch_time_seconds is the sum of estimatedMinutesWatched * 60 across
-- all daily-view rows for the post.
-- impressions_count was already implied by views on non-IG platforms;
-- adding it explicitly here so we can hold onto the number when Zernio
-- starts exposing it (Meta already does for IG; TikTok/YT still 0).

ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS watch_time_seconds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_view_duration_seconds numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscribers_gained integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscribers_lost integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impressions_count integer DEFAULT 0;

-- No index changes — these are aggregated by existing indexes on
-- (social_profile_id, published_at) and (client_id, platform).
