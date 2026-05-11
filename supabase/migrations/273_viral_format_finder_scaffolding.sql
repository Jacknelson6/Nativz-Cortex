-- ============================================================
-- VFF-01: Viral Format Finder scaffolding
-- 5 tables: viral_formats, viral_videos, viral_video_formats,
--           viral_collections, viral_collection_videos
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Format slugs (hook_type, structure, archetype, pacing). Seed in VFF-06.
CREATE TABLE IF NOT EXISTS viral_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('hook_type', 'structure', 'archetype', 'pacing')),
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_seeded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_viral_formats_kind_slug
  ON viral_formats(kind, slug);
CREATE INDEX IF NOT EXISTS idx_viral_formats_kind ON viral_formats(kind);

-- Sourced + (optionally) analyzed short-form videos.
CREATE TABLE IF NOT EXISTS viral_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube')),
  source_url TEXT NOT NULL,
  source_url_hash TEXT NOT NULL,
  external_post_id TEXT,
  creator_handle TEXT,
  creator_display_name TEXT,
  thumbnail_source_url TEXT,
  thumbnail_storage_url TEXT,
  thumbnail_persisted_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  views_count INTEGER,
  likes_count INTEGER,
  comments_count INTEGER,
  shares_count INTEGER,
  posted_at TIMESTAMPTZ,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  analysis_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (analysis_status IN ('pending', 'analyzing', 'analyzed', 'rejected', 'failed')),
  reject_reason TEXT,
  analyzed_at TIMESTAMPTZ,
  title TEXT,
  engagement_hook_descriptor TEXT,
  why_it_works TEXT,
  retention_pattern TEXT,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_viral_videos_platform_hash
  ON viral_videos(platform, source_url_hash);
CREATE INDEX IF NOT EXISTS idx_viral_videos_status ON viral_videos(analysis_status);
CREATE INDEX IF NOT EXISTS idx_viral_videos_posted_at ON viral_videos(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_viral_videos_creator ON viral_videos(creator_handle);

-- Embedding index added after first batch lands (HNSW); leave as comment for now.
-- CREATE INDEX idx_viral_videos_embedding ON viral_videos USING hnsw (embedding vector_cosine_ops);

-- Many-to-many: a video can carry several format tags.
CREATE TABLE IF NOT EXISTS viral_video_formats (
  video_id UUID NOT NULL REFERENCES viral_videos(id) ON DELETE CASCADE,
  format_id UUID NOT NULL REFERENCES viral_formats(id) ON DELETE CASCADE,
  confidence NUMERIC,
  source TEXT NOT NULL DEFAULT 'llm'
    CHECK (source IN ('llm', 'human', 'seed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, format_id)
);
CREATE INDEX IF NOT EXISTS idx_viral_video_formats_format
  ON viral_video_formats(format_id);

-- Strategist-curated collections (e.g. "Worth stealing", per-brand pin lists).
CREATE TABLE IF NOT EXISTS viral_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_viral_collections_client
  ON viral_collections(client_id);

CREATE TABLE IF NOT EXISTS viral_collection_videos (
  collection_id UUID NOT NULL REFERENCES viral_collections(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES viral_videos(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  PRIMARY KEY (collection_id, video_id)
);

-- updated_at trigger reuses shared function `set_updated_at()` from earlier migrations.
DROP TRIGGER IF EXISTS trg_viral_formats_updated ON viral_formats;
CREATE TRIGGER trg_viral_formats_updated
  BEFORE UPDATE ON viral_formats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_viral_videos_updated ON viral_videos;
CREATE TRIGGER trg_viral_videos_updated
  BEFORE UPDATE ON viral_videos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: admin-only v1 (mirrors brand_audits)
ALTER TABLE viral_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_video_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_collection_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS viral_formats_admin_all ON viral_formats;
CREATE POLICY viral_formats_admin_all ON viral_formats
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS viral_videos_admin_all ON viral_videos;
CREATE POLICY viral_videos_admin_all ON viral_videos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS viral_video_formats_admin_all ON viral_video_formats;
CREATE POLICY viral_video_formats_admin_all ON viral_video_formats
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS viral_collections_admin_all ON viral_collections;
CREATE POLICY viral_collections_admin_all ON viral_collections
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS viral_collection_videos_admin_all ON viral_collection_videos;
CREATE POLICY viral_collection_videos_admin_all ON viral_collection_videos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
