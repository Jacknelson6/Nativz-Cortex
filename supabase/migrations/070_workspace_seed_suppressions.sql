-- Remember when the user deletes an auto-seeded presentation so we do not recreate it on every list load.
CREATE TABLE IF NOT EXISTS workspace_seed_suppressions (
  seed_key TEXT PRIMARY KEY,
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE workspace_seed_suppressions IS 'Blocks auto-insert of default seeded presentations after explicit delete.';
