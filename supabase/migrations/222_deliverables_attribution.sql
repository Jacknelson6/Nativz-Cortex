-- =============================================================================
-- 222_deliverables_attribution.sql
-- Phase C of the deliverables pivot: editor attribution + margin denominator.
--
-- Phase A added per-type ledger columns. Phase B added the client-facing
-- surface + soft-block. Phase C closes two visibility gaps:
--
--   1. Every consume row gets stamped with the editor responsible (so the
--      admin shell can answer "what did each editor cost us this month").
--   2. team_members carries an hourly cost rate so the margin view has a
--      denominator. NULL means "not configured" and the row hides from
--      margin calculations (no division-by-zero, no fake numbers).
--
-- Schema follows the PRD shape (tasks/prd-deliverables-phase-c-pipeline.md)
-- but maps to the real table names: the DB still calls the ledger
-- credit_transactions internally; only client-facing surfaces speak
-- "deliverables" (Option 1 from the directional pivot memo).
--
-- Migration is additive and idempotent under retry.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. credit_transactions: editor attribution + revision count + back-pointer
-- -----------------------------------------------------------------------------

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS editor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- revision_count is a snapshot at consume time (how many revision cycles
-- the editor went through before approval). Useful both for editor scoring
-- and for the future "edits per video" KPI on the margin view.
ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS revision_count INTEGER NOT NULL DEFAULT 0;

-- deliverable_id is a generic FK pointer (no constraint). Resolved per-type
-- in app code: edited_video → content_drop_videos.id, ugc_video / static_graphic
-- TBD when those types start producing physical artifacts. Loose by design;
-- a hard FK would force one row per type-table forever.
ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS deliverable_id UUID;

-- Hot path: "show me everything Alice consumed last month."
CREATE INDEX IF NOT EXISTS idx_credit_tx_editor_created
  ON credit_transactions (editor_user_id, created_at DESC)
  WHERE editor_user_id IS NOT NULL;

COMMENT ON COLUMN credit_transactions.editor_user_id IS
  'auth.users.id of the editor responsible for the deliverable that this consume '
  'row charges for. Stamped on consume kind only; refund / grant / expire rows '
  'leave it NULL. Sourced from content_drop_videos.revised_video_uploaded_by '
  'when the consume comes from a drop video; falls back to NULL when the chain '
  'cannot be resolved (early consumes, manual adjusts).';

COMMENT ON COLUMN credit_transactions.revision_count IS
  'Number of revision cycles the deliverable went through before this consume '
  'fired. 0 = approved on first send. Used by the margin view.';

COMMENT ON COLUMN credit_transactions.deliverable_id IS
  'Generic pointer to the physical artifact this consume relates to. Resolution '
  'is type-specific: edited_video → content_drop_videos.id. No FK so the column '
  'survives table renames and per-type artifact migrations.';

-- -----------------------------------------------------------------------------
-- 2. team_members: hourly cost rate (margin denominator)
-- -----------------------------------------------------------------------------

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS cost_rate_cents_per_hour INTEGER;

COMMENT ON COLUMN team_members.cost_rate_cents_per_hour IS
  'Internal hourly cost in cents for the margin view. NULL = not configured; '
  'the editor is excluded from per-editor margin calculations (no division-by-zero). '
  'Admin sets this once per editor in the team management UI.';

-- -----------------------------------------------------------------------------
-- 3. Backfill editor_user_id and deliverable_id for historical drop-video consumes
--
--    Only revised uploads carry an explicit uploader (revised_video_uploaded_by).
--    First-cut uploads have no editor stamp on the table itself, so those rows
--    stay NULL and are excluded from per-editor reporting (the PRD acceptance
--    bar is "70% of historical rows backfilled" so partial OK).
-- -----------------------------------------------------------------------------

UPDATE credit_transactions t
SET editor_user_id = v.revised_video_uploaded_by,
    deliverable_id = v.id
FROM content_drop_videos v
WHERE t.charge_unit_kind = 'drop_video'
  AND t.charge_unit_id = v.id
  AND t.kind = 'consume'
  AND t.editor_user_id IS NULL
  AND v.revised_video_uploaded_by IS NOT NULL;

-- For consumes where the charge unit is the scheduled_post (legacy fallback),
-- still backfill deliverable_id by joining through to the drop video where one
-- exists. Editor stays NULL for these unless a revision was uploaded.
UPDATE credit_transactions t
SET deliverable_id = v.id,
    editor_user_id = COALESCE(t.editor_user_id, v.revised_video_uploaded_by)
FROM content_drop_videos v
WHERE t.charge_unit_kind = 'scheduled_post'
  AND t.charge_unit_id = v.scheduled_post_id
  AND t.kind = 'consume'
  AND t.deliverable_id IS NULL;

COMMIT;

-- =============================================================================
-- end of 222_deliverables_attribution.sql
-- =============================================================================
