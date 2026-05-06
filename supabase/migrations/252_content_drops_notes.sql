-- Add `notes` to content_drops so the SMM modal has parity with the
-- editing modal's Notes section. Existing strategist_id + editor_id
-- already came from migration 240 - this is the last column the
-- unified review modal needs to render the same Team / Notes / view
-- counter triple on both flows.
ALTER TABLE content_drops
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;

COMMENT ON COLUMN content_drops.notes IS
  'Internal notes / hand-off context for the SMM (calendar) drop. Mirrors editing_projects.notes so the unified review modal can render the same Notes section across both flows.';
