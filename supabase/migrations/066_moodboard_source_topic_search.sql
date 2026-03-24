-- Link moodboards back to the topic search that seeded them (ideation pipeline).
ALTER TABLE moodboard_boards
  ADD COLUMN IF NOT EXISTS source_topic_search_id UUID REFERENCES topic_searches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_moodboard_boards_source_topic_search
  ON moodboard_boards(source_topic_search_id)
  WHERE source_topic_search_id IS NOT NULL;
