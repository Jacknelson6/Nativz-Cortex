-- Migration 176: Add caption draft + scheduling columns to content_drop_videos
-- Phase 3 of Content Calendar Scheduler: caption generator writes draft_caption,
-- draft_hashtags, caption_score, caption_iterations. Phase 4 fills draft_scheduled_at
-- once slots are distributed.

ALTER TABLE content_drop_videos
  ADD COLUMN IF NOT EXISTS draft_caption text,
  ADD COLUMN IF NOT EXISTS draft_hashtags text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS draft_scheduled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_content_drop_videos_scheduled_at
  ON content_drop_videos(draft_scheduled_at)
  WHERE draft_scheduled_at IS NOT NULL;
