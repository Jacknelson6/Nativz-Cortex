-- Ephemeral clients for ad creatives URL flow (persist Brand DNA without roster noise)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hide_from_roster BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clients_hide_from_roster
  ON clients (organization_id, hide_from_roster)
  WHERE hide_from_roster = true;
