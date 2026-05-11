-- ============================================================
-- SPY-07: Prospect to client conversion
-- Bi-directional FKs that keep prospect history queryable from
-- the new client record. prospects.archived_at already exists
-- (added in 277_prospects.sql) so we only add the bridge.
-- Renumbered from PRD's 282 to keep the 290+ SPY block contiguous.
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS converted_from_prospect_id UUID
    REFERENCES prospects(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_converted_from_prospect
  ON clients(converted_from_prospect_id)
  WHERE converted_from_prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_converted_from_prospect
  ON clients(converted_from_prospect_id)
  WHERE converted_from_prospect_id IS NOT NULL;

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS converted_to_client_id UUID
    REFERENCES clients(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prospects_converted_to_client
  ON prospects(converted_to_client_id)
  WHERE converted_to_client_id IS NOT NULL;
