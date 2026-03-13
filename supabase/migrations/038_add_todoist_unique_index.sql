-- Prevent duplicate tasks from Todoist sync (BUG-8)
-- First deduplicate existing records (keep the earliest)
DELETE FROM tasks a
USING tasks b
WHERE a.todoist_task_id IS NOT NULL
  AND a.todoist_task_id = b.todoist_task_id
  AND a.created_at > b.created_at;

-- Add unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_todoist_id
  ON tasks (todoist_task_id)
  WHERE todoist_task_id IS NOT NULL;
