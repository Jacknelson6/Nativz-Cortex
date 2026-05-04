-- =============================================================================
-- 234_payroll_entries_source.sql
-- Phase 6 of the service-capacity-accounting PRD.
--
-- payroll_entries.source already exists (migration 121) as a free-form text
-- column with no CHECK and the existing accounting-hook writes
-- source = 'content_pipeline' for auto-rows created from the pipeline.
--
-- This migration:
--   1. Backfills NULL → 'manual' so every row has a defined provenance.
--   2. Adds a CHECK that allows the PRD's three values plus the legacy
--      'content_pipeline' value (preserved for back-compat with the existing
--      pipeline auto-link path).
--   3. Sets NOT NULL with default 'manual'.
--   4. Adds the partial unique dedup index for the new auto-populate-editing
--      module: one auto-row per (period, client, editor, entry_type).
--
-- Idempotent under retry.
-- =============================================================================

BEGIN;

UPDATE payroll_entries
SET source = 'manual'
WHERE source IS NULL;

ALTER TABLE payroll_entries
  DROP CONSTRAINT IF EXISTS payroll_entries_source_check;

ALTER TABLE payroll_entries
  ADD CONSTRAINT payroll_entries_source_check
    CHECK (source IN ('manual', 'auto', 'auto-edited', 'content_pipeline'));

ALTER TABLE payroll_entries
  ALTER COLUMN source SET DEFAULT 'manual';

ALTER TABLE payroll_entries
  ALTER COLUMN source SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_entries_auto_dedup
  ON payroll_entries (period_id, client_id, team_member_id, entry_type)
  WHERE source IN ('auto', 'auto-edited');

COMMENT ON COLUMN payroll_entries.source IS
  'Provenance of the row. ''manual'' = admin-typed (default). ''auto'' = '
  'system-created by lib/accounting/auto-populate-editing.ts from approved '
  'deliverables (credit_transactions consume rows). ''auto-edited'' = an auto '
  'row that an admin then touched, which excludes it from re-sync overwrites. '
  '''content_pipeline'' = legacy auto-link from lib/pipeline/accounting-hook.ts '
  '(one row per pipeline item; deduped on source_id).';

COMMIT;
