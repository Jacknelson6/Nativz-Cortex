-- State machine for editor -> SMM handoff. See PRD CUP-01.
-- Adds handoff_state enum + history jsonb on content_drops, backfills
-- legacy rows (rows that already minted/sent a share link are treated
-- as if SMM had approved them), and adds a partial index for the
-- "awaiting SMM" admin filter.

DO $$ BEGIN
  CREATE TYPE drop_handoff_state AS ENUM (
    'editing',
    'smm_review',
    'smm_approved',
    'smm_rejected',
    'client_sent'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE content_drops
  ADD COLUMN IF NOT EXISTS handoff_state drop_handoff_state NOT NULL DEFAULT 'editing',
  ADD COLUMN IF NOT EXISTS handoff_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: drops with a share link that has been sent to the client
-- are considered already-sent, drops with a minted-but-unsent share
-- link are considered approved (waiting on the SMM to press send).
UPDATE content_drops cd
SET handoff_state = 'client_sent',
    handoff_history = jsonb_build_array(jsonb_build_object(
      'state', 'client_sent',
      'at', NOW(),
      'actor', 'system-backfill',
      'note', 'migration 319 backfill - pre-existing sent share link'
    ))
WHERE cd.handoff_state = 'editing'
  AND EXISTS (
    SELECT 1 FROM content_drop_share_links sl
    WHERE sl.drop_id = cd.id AND sl.first_sent_at IS NOT NULL
  );

UPDATE content_drops cd
SET handoff_state = 'smm_approved',
    handoff_history = jsonb_build_array(jsonb_build_object(
      'state', 'smm_approved',
      'at', NOW(),
      'actor', 'system-backfill',
      'note', 'migration 319 backfill - minted but unsent share link'
    ))
WHERE cd.handoff_state = 'editing'
  AND EXISTS (
    SELECT 1 FROM content_drop_share_links sl
    WHERE sl.drop_id = cd.id AND sl.first_sent_at IS NULL
  );

CREATE INDEX IF NOT EXISTS content_drops_smm_review_idx
  ON content_drops (handoff_state, updated_at DESC)
  WHERE handoff_state = 'smm_review';
