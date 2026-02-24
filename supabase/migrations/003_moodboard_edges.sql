CREATE TABLE IF NOT EXISTS moodboard_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES moodboard_boards(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  label TEXT,
  style TEXT DEFAULT 'solid',
  color TEXT DEFAULT '#888888',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moodboard_edges_board ON moodboard_edges(board_id);
