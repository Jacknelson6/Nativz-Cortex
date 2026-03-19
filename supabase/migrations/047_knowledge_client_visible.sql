-- Add client_visible column to control which knowledge entries portal users can see
ALTER TABLE client_knowledge_entries
ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT false;

-- All existing entries default to false (internal only).
-- Admins explicitly mark entries as visible to clients.
