-- Real scraped videos from topic searches
CREATE TABLE IF NOT EXISTS topic_search_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES topic_searches(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube', 'instagram')),
  platform_id TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  title TEXT,
  description TEXT,
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  bookmarks INTEGER DEFAULT 0,
  author_username TEXT,
  author_display_name TEXT,
  author_avatar TEXT,
  author_followers BIGINT DEFAULT 0,
  outlier_score REAL,
  hook_text TEXT,
  hashtags TEXT[],
  duration_seconds INTEGER,
  publish_date TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(search_id, platform, platform_id)
);

CREATE INDEX IF NOT EXISTS idx_tsv_search_id ON topic_search_videos(search_id);
CREATE INDEX IF NOT EXISTS idx_tsv_outlier ON topic_search_videos(search_id, outlier_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tsv_views ON topic_search_videos(search_id, views DESC);

-- Extracted hook patterns
CREATE TABLE IF NOT EXISTS topic_search_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES topic_searches(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  video_count INTEGER DEFAULT 0,
  avg_views BIGINT DEFAULT 0,
  avg_outlier_score REAL DEFAULT 0,
  example_video_ids UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tsh_search_id ON topic_search_hooks(search_id);
