-- Phase 4: Organization & Collaboration

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

-- Add video_timestamp to comments for timestamp-linked comments
ALTER TABLE moodboard_comments ADD COLUMN IF NOT EXISTS video_timestamp INTEGER;
