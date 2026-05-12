-- late_post_id history audit table.
--
-- Per-leg retry creates a NEW Zernio post (rotation); publish-posts writes
-- the new id over the parent's late_post_id. Webhooks for the OLD
-- late_post_id arrive after rotation, match no parent, and get silently
-- dropped. The historical audit trail is also lost: you can't replay
-- "what did Zernio say at attempt 1?"
--
-- Solution: every late_post_id mutation appends a row. Rotation retires
-- the prior row. Webhook handler + reconciler fall back to a join on
-- this table when the direct match fails.

CREATE TABLE IF NOT EXISTS scheduled_post_late_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  late_post_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz NULL
);

-- Webhook-handler hot path: O(1) lookup by late_post_id.
CREATE INDEX IF NOT EXISTS idx_scheduled_post_late_ids_late_post_id
  ON scheduled_post_late_ids (late_post_id);

-- Forensic queries by post: chronological by created_at.
CREATE INDEX IF NOT EXISTS idx_scheduled_post_late_ids_post_id
  ON scheduled_post_late_ids (post_id, created_at DESC);

-- Active row per (post_id, late_post_id). Multiple rotations are allowed
-- (one retired + one current), but two active rows for the same handle
-- would be a bug.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_post_late_ids_active
  ON scheduled_post_late_ids (post_id, late_post_id)
  WHERE retired_at IS NULL;

COMMENT ON TABLE scheduled_post_late_ids IS
  'Audit log of every late_post_id ever assigned to a scheduled_post. retired_at = NULL means active; otherwise the row was retired during a retry rotation.';

ALTER TABLE scheduled_post_late_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_post_late_ids admin all"
  ON scheduled_post_late_ids
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  );
