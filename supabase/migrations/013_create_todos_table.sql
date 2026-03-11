-- Per-user to-do list for dashboard widget

CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  due_date DATE,
  assigned_by UUID REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_user_incomplete ON todos(user_id, is_completed)
  WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date)
  WHERE due_date IS NOT NULL;

-- RLS: users see only their own todos, admins can see/create for others
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- Users can read their own todos
CREATE POLICY "Users can read own todos"
  ON todos FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can insert todos for themselves; admins can insert for anyone
CREATE POLICY "Users can insert own todos"
  ON todos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR assigned_by = auth.uid());

-- Users can update their own todos
CREATE POLICY "Users can update own todos"
  ON todos FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Users can delete their own todos
CREATE POLICY "Users can delete own todos"
  ON todos FOR DELETE TO authenticated
  USING (user_id = auth.uid());
