-- Migration 201: Editing pipeline data model
--
-- Cortex becomes the source of truth for editing-pipeline state. Today
-- "is this project ready to schedule?" lives on a Monday board outside
-- the app; editors upload to Drive folders that frequently break on
-- permission walls. This migration introduces an internal model:
--
--   editing_projects        - one row per editing job. Holds status,
--                             assignee, project type, parent client.
--                             Persists even after the project ships so
--                             we have a long-term audit trail.
--   editing_project_videos  - one row per uploaded clip. Files live in
--                             Supabase Storage (`editing-media` bucket)
--                             OR can reference a Drive file id for the
--                             legacy Monday/Drive path.
--
-- Status transitions:
--   draft       editor uploading, not ready for review
--   in_review   editor flipped "ready"; admin sees it in Quick Schedule
--   approved    admin signed off; ready for runCalendarPipeline
--   scheduled   pipeline ran; content_drops row exists
--   posted      every late_posted_at on the drop's videos has fired
--   archived    soft-deleted from the active board
--
-- We keep `drive_folder_url` so legacy Monday-driven projects can be
-- imported without files (or so an editor can stage in Drive then
-- "import folder" later). New projects default to internal upload.
--
-- Soft delete: the `archived_at` column on share_links + the
-- `editing_projects.status='archived'` state share the same idea -
-- nothing is destructively deleted from this app. Right-click "Delete"
-- on a Project row in /admin/content-tools sets `archived_at`; the row
-- disappears from the board but the underlying drop + share-link rows
-- stay intact.

-- 1. editing_projects -------------------------------------------------

CREATE TABLE IF NOT EXISTS editing_projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  project_type    TEXT NOT NULL DEFAULT 'organic_content'
                  CHECK (project_type IN ('organic_content', 'social_ads', 'ctv_ads', 'general', 'other')),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'in_review', 'approved', 'scheduled', 'posted', 'archived')),
  assignee_id     UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  drive_folder_url TEXT NULL,
  notes           TEXT NULL,
  -- When the pipeline runs, point at the produced drop so the project
  -- card can deep-link to the share link / scheduled posts list.
  drop_id         UUID NULL REFERENCES content_drops(id) ON DELETE SET NULL,
  created_by      UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at        TIMESTAMPTZ NULL,    -- when status flipped to in_review
  approved_at     TIMESTAMPTZ NULL,
  scheduled_at    TIMESTAMPTZ NULL,
  archived_at     TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS editing_projects_client_idx
  ON editing_projects (client_id, status);
CREATE INDEX IF NOT EXISTS editing_projects_status_ready_idx
  ON editing_projects (status, ready_at DESC NULLS LAST);

COMMENT ON TABLE editing_projects IS
  'Internal editing-pipeline tracker. One row per project. Source of truth for status (draft/in_review/approved/scheduled/posted/archived). Quick Schedule tab pulls "approved" rows alongside Monday EM-Approved items.';
COMMENT ON COLUMN editing_projects.drive_folder_url IS
  'Optional. Set when the project was created from a Monday/Drive workflow. New projects use internal Supabase Storage upload via editing_project_videos.';
COMMENT ON COLUMN editing_projects.drop_id IS
  'Set after Quick Schedule runs the pipeline. Lets the project card deep-link to the produced share link.';
COMMENT ON COLUMN editing_projects.ready_at IS
  'Stamped when status flips draft -> in_review (editor marked ready).';

-- 2. editing_project_videos ------------------------------------------

CREATE TABLE IF NOT EXISTS editing_project_videos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES editing_projects(id) ON DELETE CASCADE,
  -- Supabase Storage path (preferred). When set, public_url should be
  -- the storage public URL.
  storage_path  TEXT NULL,
  public_url    TEXT NULL,
  -- Legacy Drive file id when the project was imported from Drive.
  -- Either storage_path OR drive_file_id must be non-null.
  drive_file_id TEXT NULL,
  filename      TEXT NOT NULL,
  mime_type     TEXT NULL,
  size_bytes    BIGINT NULL,
  duration_s    NUMERIC NULL,
  thumbnail_url TEXT NULL,
  -- Editors can re-upload a revision; older versions stay in the table
  -- so we have a history. UI only renders the highest version per
  -- position by default.
  version       INT NOT NULL DEFAULT 1,
  position      INT NOT NULL DEFAULT 0,
  uploaded_by   UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (storage_path IS NOT NULL OR drive_file_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS editing_project_videos_project_idx
  ON editing_project_videos (project_id, position, version DESC);

COMMENT ON TABLE editing_project_videos IS
  'Videos attached to an editing project. Either Supabase-Storage backed (storage_path + public_url) or Drive-backed (drive_file_id). Multi-version history kept; UI renders highest version per position.';

-- 3. content_drop_share_links soft-delete ----------------------------
--
-- /admin/content-tools Projects-table right-click delete needs to hide
-- the row without nuking the underlying drop. We add `archived_at` and
-- update /api/calendar/review to filter it out by default.

ALTER TABLE content_drop_share_links
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_drop_share_links_archived_idx
  ON content_drop_share_links (archived_at) WHERE archived_at IS NULL;

COMMENT ON COLUMN content_drop_share_links.archived_at IS
  'Soft-delete timestamp. Set by the admin when they remove the project from /admin/content-tools. Underlying drop + posts stay intact; only the link is hidden.';

-- 4. RLS --------------------------------------------------------------
--
-- Both tables are admin-only for now. Editors are admin-role users in
-- the current model; per-editor RBAC is a follow-up. We mirror the
-- pattern used elsewhere: admins (role='admin' or 'super_admin') get
-- full SELECT/INSERT/UPDATE/DELETE; everyone else is locked out.

ALTER TABLE editing_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE editing_project_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS editing_projects_admin_all ON editing_projects;
CREATE POLICY editing_projects_admin_all ON editing_projects
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

DROP POLICY IF EXISTS editing_project_videos_admin_all ON editing_project_videos;
CREATE POLICY editing_project_videos_admin_all ON editing_project_videos
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

-- 5. updated_at trigger ----------------------------------------------

CREATE OR REPLACE FUNCTION editing_projects_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS editing_projects_updated_at ON editing_projects;
CREATE TRIGGER editing_projects_updated_at
  BEFORE UPDATE ON editing_projects
  FOR EACH ROW EXECUTE FUNCTION editing_projects_set_updated_at();
