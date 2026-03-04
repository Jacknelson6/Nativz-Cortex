-- Social media reporting tables

-- Daily aggregate metrics per social profile
CREATE TABLE IF NOT EXISTS platform_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_profile_id UUID NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'youtube')),
  snapshot_date DATE NOT NULL,
  followers_count INTEGER DEFAULT 0,
  followers_change INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  engagement_count INTEGER DEFAULT 0,
  engagement_rate NUMERIC,
  posts_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_snapshots_unique
  ON platform_snapshots(social_profile_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_platform_snapshots_client_date
  ON platform_snapshots(client_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_platform_snapshots_platform
  ON platform_snapshots(platform);

-- Per-post performance metrics
CREATE TABLE IF NOT EXISTS post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_profile_id UUID NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'youtube')),
  external_post_id TEXT NOT NULL,
  post_url TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  post_type TEXT CHECK (post_type IN ('video', 'image', 'reel', 'short', 'carousel', 'story')),
  published_at TIMESTAMPTZ,
  views_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  saves_count INTEGER DEFAULT 0,
  reach_count INTEGER DEFAULT 0,
  engagement_rate NUMERIC,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_metrics_unique
  ON post_metrics(external_post_id, platform);
CREATE INDEX IF NOT EXISTS idx_post_metrics_client_date
  ON post_metrics(client_id, published_at);

-- RLS
ALTER TABLE platform_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage platform_snapshots"
  ON platform_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage post_metrics"
  ON post_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);
