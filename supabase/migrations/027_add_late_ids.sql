-- Add Late API reference IDs for sync
ALTER TABLE social_profiles ADD COLUMN IF NOT EXISTS late_account_id TEXT;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS late_post_id TEXT;
ALTER TABLE scheduler_media ADD COLUMN IF NOT EXISTS late_media_url TEXT;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_social_profiles_late_account_id ON social_profiles(late_account_id) WHERE late_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_late_post_id ON scheduled_posts(late_post_id) WHERE late_post_id IS NOT NULL;
