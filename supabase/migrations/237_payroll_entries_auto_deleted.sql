-- =============================================================================
-- 237_payroll_entries_auto_deleted.sql
--
-- US-004 of the service-capacity-accounting PRD requires that admin-deleted
-- auto rows stay deleted across re-syncs (until the period closes). The
-- previous DELETE handler hard-deleted the row, which let the next
-- auto-populate run resurrect it from the same approved consume rows.
--
-- This migration extends payroll_entries.source with an 'auto-deleted'
-- tombstone state and folds it into the partial unique index so the engine
-- can read the tombstone, recognise the (period, client, editor) slot is
-- already taken, and skip the insert.
--
-- Idempotent under retry.
-- =============================================================================

BEGIN;

ALTER TABLE payroll_entries
  DROP CONSTRAINT IF EXISTS payroll_entries_source_check;

ALTER TABLE payroll_entries
  ADD CONSTRAINT payroll_entries_source_check
    CHECK (source IN ('manual', 'auto', 'auto-edited', 'auto-deleted', 'content_pipeline'));

DROP INDEX IF EXISTS idx_payroll_entries_auto_dedup;

CREATE UNIQUE INDEX idx_payroll_entries_auto_dedup
  ON payroll_entries (period_id, client_id, team_member_id, entry_type)
  WHERE source IN ('auto', 'auto-edited', 'auto-deleted');

COMMENT ON COLUMN payroll_entries.source IS
  'Provenance of the row. ''manual'' = admin-typed (default). ''auto'' = '
  'system-created by lib/accounting/auto-populate-editing.ts from approved '
  'deliverables (credit_transactions consume rows). ''auto-edited'' = an auto '
  'row that an admin then touched, which excludes it from re-sync overwrites. '
  '''auto-deleted'' = soft-delete tombstone for an admin-deleted auto row; '
  'the engine treats this as a held slot so re-sync does not resurrect the '
  'row until the period closes. ''content_pipeline'' = legacy auto-link from '
  'lib/pipeline/accounting-hook.ts (one row per pipeline item; deduped on '
  'source_id).';

COMMIT;
