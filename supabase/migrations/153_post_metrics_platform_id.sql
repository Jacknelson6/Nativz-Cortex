-- Cache the native platform post id (YouTube videoId, TikTok videoId, IG media
-- id) on post_metrics so subsequent syncs can fan out to platform-specific
-- endpoints like /analytics/youtube/daily-views?videoId=X without re-fetching
-- the whole /analytics response first.
--
-- external_post_id is Zernio's internal id (_id). platform_post_id is the
-- native platform identifier (platforms[].platformPostId in Zernio's
-- /analytics response). They're different strings; we now persist both.

ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS platform_post_id text;

CREATE INDEX IF NOT EXISTS post_metrics_platform_post_id_idx
  ON post_metrics (social_profile_id, platform, platform_post_id)
  WHERE platform_post_id IS NOT NULL;
