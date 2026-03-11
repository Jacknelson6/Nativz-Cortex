-- Add archived_at for soft delete on tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived_at) WHERE archived_at IS NULL;
