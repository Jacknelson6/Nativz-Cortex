-- ─────────────────────────────────────────────────────────────────────────
-- Migration 104 — Pre-audit attach-to-client
--
-- Pairs the audit with a client up-front (confirm-platforms screen) so
-- Phase 2's cron picks it up automatically the moment the run completes,
-- without requiring a second "Attach to client" click on the report.
-- Retroactive attaching still works via the post-report button for audits
-- that were started without a client in mind.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE prospect_audits
  ADD COLUMN IF NOT EXISTS attached_client_id UUID
    REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prospect_audits_attached_client
  ON prospect_audits(attached_client_id)
  WHERE attached_client_id IS NOT NULL;

COMMENT ON COLUMN prospect_audits.attached_client_id IS
  'Optional. Set on the confirm-platforms screen so the post-completion step auto-creates a client_benchmarks row. Null = unattached.';
