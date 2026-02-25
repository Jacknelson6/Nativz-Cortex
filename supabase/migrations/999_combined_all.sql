-- Combined migration: all Nativz Cortex migrations in order.
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT throughout).
-- Generated: 2026-02-25

-- =============================================================================
-- 001_moodboard_phase1.sql — Moodboard Schema Updates
-- =============================================================================

ALTER TABLE moodboard_items ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE moodboard_items ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE moodboard_items ADD COLUMN IF NOT EXISTS author_handle TEXT;
ALTER TABLE moodboard_items ADD COLUMN IF NOT EXISTS stats JSONB;
ALTER TABLE moodboard_items ADD COLUMN IF NOT EXISTS music TEXT;
ALTER TABLE moodboard_items ADD COLUMN IF NOT EXISTS hashtags JSONB DEFAULT '[]';
ALTER TABLE moodboard_items ADD COLUMN IF NOT EXISTS hook_score INTEGER;
ALTER TABLE moodboard_items ADD COLUMN IF NOT EXISTS hook_type TEXT;
ALTER TABLE moodboard_items ADD COLUMN IF NOT EXISTS transcript_segments JSONB DEFAULT '[]';
ALTER TABLE moodboard_items ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE moodboard_comments ADD COLUMN IF NOT EXISTS video_timestamp INTEGER;

CREATE INDEX IF NOT EXISTS idx_moodboard_items_board ON moodboard_items(board_id);
CREATE INDEX IF NOT EXISTS idx_moodboard_items_status ON moodboard_items(status);
CREATE INDEX IF NOT EXISTS idx_moodboard_items_platform ON moodboard_items(platform);
CREATE INDEX IF NOT EXISTS idx_moodboard_comments_item ON moodboard_comments(item_id);

-- =============================================================================
-- 003_moodboard_edges.sql — Edge connections between moodboard nodes
-- =============================================================================

CREATE TABLE IF NOT EXISTS moodboard_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES moodboard_boards(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  label TEXT,
  style TEXT DEFAULT 'solid',
  color TEXT DEFAULT '#888888',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moodboard_edges_board ON moodboard_edges(board_id);

-- =============================================================================
-- 004_moodboard_phase4.sql — Organization & Collaboration
-- =============================================================================

CREATE TABLE IF NOT EXISTS moodboard_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES moodboard_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  UNIQUE(board_id, name)
);

CREATE TABLE IF NOT EXISTS moodboard_item_tags (
  item_id UUID REFERENCES moodboard_items(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES moodboard_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_moodboard_item_tags_item ON moodboard_item_tags(item_id);

ALTER TABLE moodboard_boards ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- video_timestamp on comments (also in 001, safe to re-run with IF NOT EXISTS)
ALTER TABLE moodboard_comments ADD COLUMN IF NOT EXISTS video_timestamp INTEGER;

-- =============================================================================
-- 005_moodboard_phase5.sql — Sharing & Export
-- =============================================================================

CREATE TABLE IF NOT EXISTS moodboard_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES moodboard_boards(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moodboard_share_links_token ON moodboard_share_links(token);

-- =============================================================================
-- 006_search_mode_column.sql — Search mode on topic_searches
-- =============================================================================

ALTER TABLE topic_searches ADD COLUMN IF NOT EXISTS search_mode TEXT DEFAULT 'general';

-- =============================================================================
-- 007_agency_settings.sql — Agency scheduling settings
-- =============================================================================

CREATE TABLE IF NOT EXISTS agency_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency TEXT NOT NULL UNIQUE,
  scheduling_link TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO agency_settings (agency) VALUES ('nativz'), ('ac') ON CONFLICT DO NOTHING;

ALTER TABLE agency_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admin read agency_settings'
  ) THEN
    CREATE POLICY "Admin read agency_settings" ON agency_settings
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admin update agency_settings'
  ) THEN
    CREATE POLICY "Admin update agency_settings" ON agency_settings
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
      );
  END IF;
END $$;
