-- Phase 1: Foundation Fix — Moodboard Schema Updates

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
