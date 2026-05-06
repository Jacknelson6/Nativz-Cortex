-- 251_editing_share_link_followup_tracking.sql
--
-- Adds last_followup_at + followup_count to editing_project_share_links so
-- the unified review board's "Last followup" column populates for editing
-- rows the same way it does for calendar (content_drop_share_links got
-- these in migration 200). Backfills last_followup_at = created_at for
-- existing rows so stale links don't read as "never followed up" when they
-- were created before this column existed.

ALTER TABLE editing_project_share_links
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS followup_count INT NOT NULL DEFAULT 0;

UPDATE editing_project_share_links
   SET last_followup_at = created_at
 WHERE last_followup_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_editing_share_links_last_followup_at
  ON editing_project_share_links (last_followup_at);
