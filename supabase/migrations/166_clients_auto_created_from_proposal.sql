-- 166_clients_auto_created_from_proposal.sql
-- ----------------------------------------------------------------------------
-- Sales pipeline unification (spec: 2026-04-25-sales-pipeline-unification.md).
-- When an admin generates a proposal for a brand-new prospect that doesn't
-- yet have a `clients` row, we auto-create a thin lead row so the proposal
-- (and the flow that auto-creates on sign) always has a real target. We
-- flag those rows here so we can identify them later and decide whether to
-- backfill agency/contacts.
--
-- Idempotent — safe to re-run.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS auto_created_from_proposal_id UUID
    REFERENCES proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_auto_created_from_proposal_id_idx
  ON clients(auto_created_from_proposal_id)
  WHERE auto_created_from_proposal_id IS NOT NULL;

COMMENT ON COLUMN clients.auto_created_from_proposal_id IS
  'Set when this clients row was spawned by createProposalDraft because the admin generated a proposal for a brand-new prospect (no client picked). The row is intentionally thin — name from signer_legal_entity, lifecycle_state=lead — and gets fleshed out as the relationship deepens. NULL on every manually-created clients row.';

NOTIFY pgrst, 'reload schema';
