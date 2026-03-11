-- Full task management table (Monday.com replacement)

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'in_progress', 'review', 'done')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  client_id UUID REFERENCES clients(id),
  assignee_id UUID REFERENCES team_members(id),
  created_by UUID REFERENCES auth.users(id),
  due_date DATE,
  task_type TEXT DEFAULT 'other' CHECK (task_type IN ('content', 'shoot', 'edit', 'paid_media', 'strategy', 'other')),
  shoot_date DATE,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);

-- RLS: authenticated users can manage all tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage tasks"
  ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
