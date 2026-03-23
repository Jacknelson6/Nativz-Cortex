-- Toggle visibility of admin client workspace nav items (Brand DNA, Moodboard, etc.).
-- Overview, Workspace, and Settings always stay visible in code.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS admin_workspace_modules jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN clients.admin_workspace_modules IS 'JSON map of nav keys to boolean; false hides that section in /admin/clients/[slug] sidebar. Missing keys default to visible.';
