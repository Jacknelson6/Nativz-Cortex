-- Per-user folders for organizing topic searches (research history rail).

CREATE TABLE IF NOT EXISTS topic_search_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'zinc',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topic_search_folders_user ON topic_search_folders(user_id, sort_order ASC, created_at ASC);

CREATE TABLE IF NOT EXISTS topic_search_folder_members (
  folder_id UUID NOT NULL REFERENCES topic_search_folders(id) ON DELETE CASCADE,
  topic_search_id UUID NOT NULL REFERENCES topic_searches(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, topic_search_id)
);

CREATE INDEX IF NOT EXISTS idx_ts_folder_members_folder ON topic_search_folder_members(folder_id, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_ts_folder_members_search ON topic_search_folder_members(topic_search_id);

ALTER TABLE topic_search_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_search_folder_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY topic_search_folders_own ON topic_search_folders
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY topic_search_folder_members_own ON topic_search_folder_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM topic_search_folders f
      WHERE f.id = folder_id AND f.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM topic_search_folders f
      WHERE f.id = folder_id AND f.user_id = auth.uid()
    )
  );

COMMENT ON TABLE topic_search_folders IS 'User-scoped folders for grouping topic searches in the research history rail.';
COMMENT ON TABLE topic_search_folder_members IS 'Many-to-many: topic searches placed in a folder.';
