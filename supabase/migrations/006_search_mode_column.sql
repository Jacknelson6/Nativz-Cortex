ALTER TABLE topic_searches ADD COLUMN IF NOT EXISTS search_mode TEXT DEFAULT 'general';
