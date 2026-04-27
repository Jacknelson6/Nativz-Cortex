-- Migration 175: Content Calendar Scheduler — drops, drop videos, batch share links
-- Spec: docs/superpowers/specs/2026-04-27-content-calendar-scheduler-design.md

CREATE TABLE content_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  drive_folder_url TEXT NOT NULL,
  drive_folder_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ingesting'
    CHECK (status IN ('ingesting', 'analyzing', 'generating', 'ready', 'scheduled', 'failed')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  default_post_time TIME NOT NULL DEFAULT '10:00',
  total_videos INTEGER NOT NULL DEFAULT 0,
  processed_videos INTEGER NOT NULL DEFAULT 0,
  error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_content_drops_client_status ON content_drops(client_id, status);
CREATE INDEX idx_content_drops_created_at ON content_drops(created_at DESC);

CREATE TABLE content_drop_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id UUID NOT NULL REFERENCES content_drops(id) ON DELETE CASCADE,
  scheduled_post_id UUID REFERENCES scheduled_posts(id) ON DELETE SET NULL,
  drive_file_id TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  video_url TEXT,
  thumbnail_url TEXT,
  duration_seconds NUMERIC,
  size_bytes BIGINT,
  mime_type TEXT,
  gemini_file_uri TEXT,
  gemini_context JSONB,
  caption_score INTEGER,
  caption_iterations INTEGER DEFAULT 0,
  order_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'downloading', 'analyzing', 'caption_pending', 'ready', 'failed')),
  error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_drop_videos_drop ON content_drop_videos(drop_id, order_index);
CREATE INDEX idx_drop_videos_post ON content_drop_videos(scheduled_post_id);

CREATE TABLE content_drop_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id UUID NOT NULL REFERENCES content_drops(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  included_post_ids UUID[] NOT NULL DEFAULT '{}',
  -- Maps included scheduled_post_id → post_review_links.id so we can reuse
  -- post_review_comments without changing its schema.
  post_review_link_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_viewed_at TIMESTAMPTZ
);

CREATE INDEX idx_drop_share_links_token ON content_drop_share_links(token);
CREATE INDEX idx_drop_share_links_drop ON content_drop_share_links(drop_id);

ALTER TABLE content_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_drop_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_drop_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_drops" ON content_drops FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
CREATE POLICY "admin_all_drop_videos" ON content_drop_videos FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
CREATE POLICY "admin_all_share_links" ON content_drop_share_links FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

CREATE POLICY "anon_read_share_by_token" ON content_drop_share_links FOR SELECT
  TO anon USING (expires_at > now());
