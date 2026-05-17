-- Migration 322: Phase + content_month on editing_projects, per-client
-- Google Chat webhook URL on clients.
--
-- Background.
--   editing_projects.status is the legacy lifecycle flag and has known
--   drift between the original migration-201 CHECK (draft / in_review /
--   approved / scheduled / posted / archived) and current write sites
--   that use ('editing','need_approval','revising','approved','done',
--   'archived'). We do NOT touch the status column or its constraint
--   here -- reconciling that is a separate piece of work. Phase is added
--   orthogonally so the new admin Content Tools UI has one stable column
--   to sort, filter and group by, regardless of which status vocabulary
--   a given row was written with.
--
--   content_month replaces the unreliable `created_at`-based month
--   sorter. It is set explicitly at project creation (with a picker that
--   defaults to the current month) and is immutable thereafter, so the
--   "content calendar for May" always lives in the May bucket even if
--   the row was created late or backdated.
--
--   raws_uploaded_at stamps when a videographer first marks raws done
--   (paste Drive link + click "Raws uploaded"). Drives the phase auto-
--   advance from Shoot done -> Raw uploaded.
--
--   clients.google_chat_webhook_url is the per-client routing target for
--   phase-change notifications. A global Ops webhook (env var) fires in
--   addition, but per-client URLs let each client team get their own
--   Chat space pinged without subscribing to every other client's flow.
--
-- Rollback.
--   Phase / content_month / raws_uploaded_at columns are pure additions
--   with safe defaults; drop them in reverse order if we need to back
--   out. The status column is untouched, so nothing here can corrupt
--   existing data.

-- 1. editing_projects.phase ----------------------------------------------

ALTER TABLE editing_projects
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'Planning'
  CHECK (phase IN (
    'Planning',
    'Shoot booked',
    'Shoot done',
    'Raw uploaded',
    'Editing',
    'Client review',
    'Approved',
    'Publishing',
    'Done'
  ));

COMMENT ON COLUMN editing_projects.phase IS
  'Orthogonal lifecycle flag driving the admin Content Tools UI. Source of truth for sorting / filtering / grouping on the list page; advances on explicit admin action (or via the phase-state-machine helper). Independent of `status`, which carries legacy lifecycle semantics and is being phased out.';

-- 2. editing_projects.content_month -------------------------------------

ALTER TABLE editing_projects
  ADD COLUMN IF NOT EXISTS content_month DATE NULL;

COMMENT ON COLUMN editing_projects.content_month IS
  'First-of-month date this project belongs to. Set explicitly at creation (defaults to current month, immutable after). Replaces the `created_at`-derived month sorter, which produced wrong buckets for projects backdated or carried over between calendar months.';

CREATE INDEX IF NOT EXISTS editing_projects_content_month_phase_idx
  ON editing_projects (content_month DESC NULLS LAST, phase);

-- 3. editing_projects.raws_uploaded_at ----------------------------------

ALTER TABLE editing_projects
  ADD COLUMN IF NOT EXISTS raws_uploaded_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN editing_projects.raws_uploaded_at IS
  'Stamped the first time a videographer (or admin) marks the Raws step done via the "Raws uploaded" button in the project slide-over. Drives the phase auto-advance from Shoot done -> Raw uploaded.';

-- 4. clients.google_chat_webhook_url ------------------------------------

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS google_chat_webhook_url TEXT NULL;

COMMENT ON COLUMN clients.google_chat_webhook_url IS
  'Per-client Google Chat incoming webhook URL. Phase-change events on editing_projects rows for this client get posted here in addition to the global Ops webhook (OPS_GOOGLE_CHAT_WEBHOOK_URL env). Null = client opted out of per-client routing (Ops still fires).';

-- 5. Backfill phase from existing state ----------------------------------
--    Covers both legacy (migration 201) and current status vocabularies.

UPDATE editing_projects SET phase = CASE
    WHEN archived_at IS NOT NULL THEN 'Done'
    WHEN status IN ('done', 'posted') THEN 'Done'
    WHEN status = 'scheduled' THEN 'Publishing'
    WHEN status = 'approved' AND scheduled_at IS NOT NULL THEN 'Publishing'
    WHEN status = 'approved' THEN 'Approved'
    WHEN status IN ('need_approval', 'revising', 'in_review') THEN 'Client review'
    WHEN status = 'editing' THEN 'Editing'
    WHEN EXISTS (
      SELECT 1 FROM editing_project_videos v WHERE v.project_id = editing_projects.id
    ) THEN 'Editing'
    WHEN drive_folder_url IS NOT NULL AND drive_folder_url <> '' THEN 'Raw uploaded'
    WHEN EXISTS (
      SELECT 1 FROM editing_project_raw_videos r WHERE r.project_id = editing_projects.id
    ) THEN 'Raw uploaded'
    WHEN shoot_date IS NOT NULL AND shoot_date < CURRENT_DATE THEN 'Shoot done'
    WHEN shoot_date IS NOT NULL THEN 'Shoot booked'
    ELSE 'Planning'
  END
WHERE phase = 'Planning';

-- 5b. Backfill raws_uploaded_at where we have a Drive link or raw clips
--     but no explicit stamp yet. Use updated_at as the best available
--     proxy; new rows will get a precise stamp via the API path.

UPDATE editing_projects SET raws_uploaded_at = COALESCE(updated_at, created_at)
WHERE raws_uploaded_at IS NULL
  AND (
    (drive_folder_url IS NOT NULL AND drive_folder_url <> '')
    OR EXISTS (
      SELECT 1 FROM editing_project_raw_videos r WHERE r.project_id = editing_projects.id
    )
  );

-- 6. Backfill content_month -----------------------------------------------
--    Preferred source: earliest scheduled_post tied to this project
--    (migration 305 added the FK). Fallback: created_at month.

UPDATE editing_projects SET content_month = (
    SELECT date_trunc('month', COALESCE(
      (SELECT MIN(sp.scheduled_at)
         FROM scheduled_posts sp
         WHERE sp.editing_project_id = editing_projects.id),
      editing_projects.created_at
    ))::date
  )
WHERE content_month IS NULL;
