-- Create moodboard tables if they don't exist
-- This is needed for the moodboard feature to work

-- moodboard_boards table
CREATE TABLE IF NOT EXISTS moodboard_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES clients(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ
);

-- moodboard_items table
CREATE TABLE IF NOT EXISTS moodboard_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES moodboard_boards(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('video', 'image', 'website')),
  url TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  platform TEXT,
  author_name TEXT,
  author_handle TEXT,
  stats JSONB,
  music TEXT,
  duration INTEGER,
  hashtags JSONB DEFAULT '[]',
  hook_score INTEGER,
  hook_type TEXT,
  transcript TEXT,
  transcript_segments JSONB DEFAULT '[]',
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  rescript JSONB,
  position_x REAL DEFAULT 0,
  position_y REAL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- moodboard_notes table
CREATE TABLE IF NOT EXISTS moodboard_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES moodboard_boards(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  color TEXT DEFAULT 'yellow',
  position_x REAL DEFAULT 0,
  position_y REAL DEFAULT 0,
  width INTEGER DEFAULT 200,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- moodboard_comments table
CREATE TABLE IF NOT EXISTS moodboard_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES moodboard_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  video_timestamp INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_moodboard_boards_client ON moodboard_boards(client_id);
CREATE INDEX IF NOT EXISTS idx_moodboard_items_board ON moodboard_items(board_id);
CREATE INDEX IF NOT EXISTS idx_moodboard_items_status ON moodboard_items(status);
CREATE INDEX IF NOT EXISTS idx_moodboard_items_platform ON moodboard_items(platform);
CREATE INDEX IF NOT EXISTS idx_moodboard_notes_board ON moodboard_notes(board_id);
CREATE INDEX IF NOT EXISTS idx_moodboard_comments_item ON moodboard_comments(item_id);

-- Enable RLS
ALTER TABLE moodboard_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE moodboard_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE moodboard_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE moodboard_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for moodboard_boards
CREATE POLICY "Admin full access moodboard_boards" ON moodboard_boards
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- RLS Policies for moodboard_items
CREATE POLICY "Admin full access moodboard_items" ON moodboard_items
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- RLS Policies for moodboard_notes
CREATE POLICY "Admin full access moodboard_notes" ON moodboard_notes
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- RLS Policies for moodboard_comments
CREATE POLICY "Admin full access moodboard_comments" ON moodboard_comments
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));
