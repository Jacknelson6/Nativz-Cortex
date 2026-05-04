-- Migration 238: Static-image and carousel support for the content calendar
-- scheduler. Adds a `media_type` discriminator on drops + posts, plus a new
-- `content_drop_post_assets` table that stores 1..N media files per post
-- (carousels). Existing video drops keep working — they implicitly behave as
-- 1-asset posts and continue to read from the legacy `video_url` /
-- `thumbnail_url` columns on content_drop_videos.

ALTER TABLE content_drops
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'video'
    CHECK (media_type IN ('video', 'image'));

ALTER TABLE content_drop_videos
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'video'
    CHECK (media_type IN ('video', 'image'));

-- A row in content_drop_videos represents a *post*. For a video post there is
-- one asset (the video itself, optionally backed by the legacy video_url
-- column for older drops). For an image post there are 1..10 image assets
-- ordered by `position` — IG/FB cap carousels at 10 items.
CREATE TABLE IF NOT EXISTS content_drop_post_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_video_id UUID NOT NULL REFERENCES content_drop_videos(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  asset_url TEXT,
  thumbnail_url TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'ready', 'failed')),
  error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drop_post_assets_post
  ON content_drop_post_assets(drop_video_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS uq_drop_post_assets_position
  ON content_drop_post_assets(drop_video_id, position);

ALTER TABLE content_drop_post_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_post_assets" ON content_drop_post_assets FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('admin','super_admin')
  ));

-- Anonymous read access for the public share page. The share link viewer
-- joins drop_post_assets to scheduled_posts via content_drop_videos to render
-- the carousel. RLS already gates content_drop_share_links by token+expiry,
-- so anyone with a valid link can resolve assets through it.
CREATE POLICY "anon_read_post_assets_via_share" ON content_drop_post_assets FOR SELECT
  TO anon USING (
    EXISTS (
      SELECT 1
      FROM content_drop_videos v
      JOIN content_drop_share_links s ON s.drop_id = v.drop_id
      WHERE v.id = content_drop_post_assets.drop_video_id
        AND s.expires_at > now()
    )
  );

-- Widen scheduled_posts.post_type so the calendar's image/carousel posts can
-- be inserted alongside legacy reel/short/video. The reporting table
-- (migration 021) already accepts these values; this brings the scheduler
-- table into alignment.
ALTER TABLE scheduled_posts DROP CONSTRAINT IF EXISTS scheduled_posts_post_type_check;
ALTER TABLE scheduled_posts ADD CONSTRAINT scheduled_posts_post_type_check
  CHECK (post_type IN ('reel', 'short', 'video', 'image', 'carousel'));

COMMENT ON COLUMN content_drops.media_type IS
  'video = legacy video drop (assets implicit, single video per post). image = new image/carousel drop, asset list lives in content_drop_post_assets.';
COMMENT ON COLUMN content_drop_videos.media_type IS
  'Inherits from content_drops.media_type at insert time. Image posts may have multiple assets in content_drop_post_assets (carousel).';
COMMENT ON TABLE content_drop_post_assets IS
  'Per-asset rows for image/carousel posts. position is 0-indexed; first asset is the carousel cover. IG/FB cap carousels at 10 items.';
