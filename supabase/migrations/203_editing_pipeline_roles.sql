-- Migration 203: Editing pipeline roles + brief + shoot date + raw footage
--
-- Goal 17 (Monday replacement): Cortex absorbs the rest of the Monday
-- content board. The existing `editing_projects` row already covers the
-- editor handoff (`assignee_id`, `editing_project_videos`). To replace
-- the strategist + videographer columns on Monday we need:
--
--   1. Per-role assignment columns. We keep `assignee_id` as the editor
--      slot (matches the legacy intent: who's cutting this) and add two
--      new columns: `videographer_id`, `strategist_id`. All three nullable
--      because not every project has all three roles wired the moment it
--      lands in Cortex.
--   2. `project_brief` — the paragraph the strategist writes for the
--      videographer + editor. Distinct from `notes` (admin scratchpad),
--      so future surfaces can render the brief alone without leaking
--      internal notes.
--   3. `shoot_date` — the on-set day. Drives the videographer page sort
--      ("upcoming shoots" vs "post-production") and unblocks deadline
--      logic later.
--   4. `editing_project_raw_videos` — sibling to `editing_project_videos`,
--      keyed by `project_id`. Same Storage-or-Drive shape, no version
--      column (raw footage is append-only; we never overwrite).
--
-- Backward compat: the existing UI reads `assignee_id`. Treating it as
-- the editor slot means no rewrite of the Editing/Quick Schedule tabs.
-- New videographer/strategist views opt in to the new columns.

-- 1. Extend editing_projects -----------------------------------------

ALTER TABLE editing_projects
  ADD COLUMN IF NOT EXISTS videographer_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS strategist_id   UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_brief   TEXT NULL,
  ADD COLUMN IF NOT EXISTS shoot_date      DATE NULL;

CREATE INDEX IF NOT EXISTS editing_projects_videographer_idx
  ON editing_projects (videographer_id, shoot_date)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS editing_projects_strategist_idx
  ON editing_projects (strategist_id, shoot_date)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS editing_projects_shoot_date_idx
  ON editing_projects (shoot_date)
  WHERE shoot_date IS NOT NULL AND archived_at IS NULL;

COMMENT ON COLUMN editing_projects.assignee_id IS
  'Editor assigned to cut this project. Legacy column name kept for backward compat with the existing UI; treat as editor going forward.';
COMMENT ON COLUMN editing_projects.videographer_id IS
  'Videographer responsible for capturing raw footage on set.';
COMMENT ON COLUMN editing_projects.strategist_id IS
  'Strategist who owns the brief and shepherds the project from kick-off to schedule.';
COMMENT ON COLUMN editing_projects.project_brief IS
  'The paragraph the strategist writes for the videographer + editor. Public to all internal roles; distinct from `notes` (admin scratchpad).';
COMMENT ON COLUMN editing_projects.shoot_date IS
  'On-set capture day. Drives videographer-page sort and downstream deadline logic.';

-- 2. editing_project_raw_videos --------------------------------------
--
-- Mirrors editing_project_videos but for raw uploads. Append-only — no
-- version column. Order by created_at when listing.

CREATE TABLE IF NOT EXISTS editing_project_raw_videos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES editing_projects(id) ON DELETE CASCADE,
  storage_path  TEXT NULL,
  public_url    TEXT NULL,
  drive_file_id TEXT NULL,
  filename      TEXT NOT NULL,
  mime_type     TEXT NULL,
  size_bytes    BIGINT NULL,
  duration_s    NUMERIC NULL,
  thumbnail_url TEXT NULL,
  label         TEXT NULL,
  uploaded_by   UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (storage_path IS NOT NULL OR drive_file_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS editing_project_raw_videos_project_idx
  ON editing_project_raw_videos (project_id, created_at DESC);

COMMENT ON TABLE editing_project_raw_videos IS
  'Raw footage uploaded by the videographer for an editing project. Append-only sibling of editing_project_videos (which holds edited cuts). Either Supabase-Storage backed or Drive-backed.';
COMMENT ON COLUMN editing_project_raw_videos.label IS
  'Optional human label, e.g. "B-roll: kitchen", "interview take 3". Free text.';

-- 3. RLS --------------------------------------------------------------
--
-- Mirrors the editing_project_videos policy: admin-only for now.
-- Per-role RBAC (so a videographer with role=videographer can SELECT
-- their own assignments) is a follow-up.

ALTER TABLE editing_project_raw_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS editing_project_raw_videos_admin_all ON editing_project_raw_videos;
CREATE POLICY editing_project_raw_videos_admin_all ON editing_project_raw_videos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role = 'admin' OR users.role = 'super_admin' OR users.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role = 'admin' OR users.role = 'super_admin' OR users.is_super_admin = true)
    )
  );
