-- Task management enhancements: Monday.com sync fields, notifications, activity log

-- Add Monday.com sync columns to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS monday_item_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS monday_board_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_monday_item ON tasks(monday_item_id) WHERE monday_item_id IS NOT NULL;

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('task_assigned', 'task_due_tomorrow', 'task_overdue', 'task_completed')),
  title TEXT NOT NULL,
  message TEXT,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can create notifications"
  ON notifications FOR INSERT TO authenticated WITH CHECK (true);

-- Task activity log
CREATE TABLE IF NOT EXISTS task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_created ON task_activity(created_at DESC);

ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage task activity"
  ON task_activity FOR ALL TO authenticated USING (true) WITH CHECK (true);
