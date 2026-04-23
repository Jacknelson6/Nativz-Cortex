-- 148_scraper_settings.sql — singleton config row for per-platform scrape volumes.
-- ----------------------------------------------------------------------------
-- Replaces the hard-coded `VOLUME_CONFIG` tiers (light/medium/deep) in
-- lib/search/platform-router.ts. Admins can now edit per-platform counts
-- from the AI settings UI and see an estimated $/search total.
--
-- The table is singleton-enforced (id=1) so there is one global config row.
-- A future migration can partition by client_id if per-client overrides
-- become necessary.

CREATE TABLE IF NOT EXISTS scraper_settings (
  id                         int PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Reddit (trudax/reddit-scraper-lite)
  reddit_posts               int NOT NULL DEFAULT 100,
  reddit_comments_per_post   int NOT NULL DEFAULT 15,

  -- YouTube (gatherYouTubeData — lib/youtube/search.ts)
  youtube_videos             int NOT NULL DEFAULT 100,
  youtube_comment_videos     int NOT NULL DEFAULT 30,
  youtube_transcript_videos  int NOT NULL DEFAULT 20,

  -- TikTok (apidojo/tiktok-scraper)
  tiktok_videos              int NOT NULL DEFAULT 200,
  tiktok_comment_videos      int NOT NULL DEFAULT 30,
  tiktok_transcript_videos   int NOT NULL DEFAULT 50,

  -- Google SERP (scraperlink/google-search-results-serp-scraper)
  web_results                int NOT NULL DEFAULT 30,

  -- Quora (Apify SERP + Serper fallback)
  quora_threads              int NOT NULL DEFAULT 25,

  updated_at                 timestamptz NOT NULL DEFAULT now(),
  updated_by                 uuid REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO scraper_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE scraper_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY scraper_settings_admin_read ON scraper_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY scraper_settings_admin_update ON scraper_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  );
