-- Add a review-pipeline status to content_drops mirroring the editing
-- project pipeline (editing/need_approval/revising/approved/done/archived).
-- This is intentionally separate from `content_drops.status`, which is the
-- processing/scheduling status (ingesting/analyzing/ready/scheduled/...).
-- NULL means "compute status from share-link state" so existing rows keep
-- behaving exactly as before. The unified review modal will use this as an
-- override when set so admins can park a drop in any pipeline stage even
-- before/after a share link exists.
ALTER TABLE content_drops
  ADD COLUMN pipeline_status TEXT NULL
  CHECK (pipeline_status IN ('editing','need_approval','revising','approved','done','archived'));

CREATE INDEX idx_content_drops_pipeline_status
  ON content_drops (client_id, pipeline_status)
  WHERE pipeline_status IS NOT NULL;
