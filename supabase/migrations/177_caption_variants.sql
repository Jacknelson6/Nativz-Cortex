-- Migration 177: Per-platform caption variants on content_drop_videos
-- Master caption stays at draft_caption; this column holds optional per-platform
-- overrides keyed by SocialPlatform ('tiktok' | 'instagram' | 'youtube' | 'facebook').
-- An empty/missing variant falls back to draft_caption at schedule time.

ALTER TABLE content_drop_videos
  ADD COLUMN IF NOT EXISTS caption_variants jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN content_drop_videos.caption_variants IS
  'Optional per-platform caption overrides. Shape: { tiktok?, instagram?, youtube?, facebook? }. Empty keys fall back to draft_caption.';
