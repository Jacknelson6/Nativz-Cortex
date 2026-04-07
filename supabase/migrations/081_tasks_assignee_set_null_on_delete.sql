-- Fix tasks.assignee_id FK to SET NULL when team member is deleted
-- (previously NO ACTION, which blocked team member deletion)

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_id_fkey
  FOREIGN KEY (assignee_id) REFERENCES team_members(id) ON DELETE SET NULL;
