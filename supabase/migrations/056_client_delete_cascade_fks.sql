-- Allow client deletion when related rows exist in tables that previously used
-- REFERENCES clients(id) without ON DELETE (Postgres default NO ACTION).

ALTER TABLE todos DROP CONSTRAINT IF EXISTS todos_client_id_fkey;
ALTER TABLE todos ADD CONSTRAINT todos_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_client_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE moodboard_boards DROP CONSTRAINT IF EXISTS moodboard_boards_client_id_fkey;
ALTER TABLE moodboard_boards ADD CONSTRAINT moodboard_boards_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
