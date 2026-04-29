-- Migration 200: Last-followup tracking for share links
--
-- Admins want a "Last followup" column on the /review table so they can
-- see at a glance how long it's been since the client was last nudged
-- about a calendar that's awaiting approval. The clock starts ticking
-- the moment the link is created (the initial review-request email is
-- effectively "followup #0"), and resets every time an admin presses
-- the in-table "Send followup" button.
--
-- We store this directly on `content_drop_share_links` rather than a
-- separate history table — the column UI only needs the latest value,
-- and the comment thread already provides a per-link audit trail if
-- we want to attach a row each time a followup is sent. Keeping a
-- counter alongside the timestamp gives the tooltip something to say
-- ("3 followups sent") without a separate count(*) query.

ALTER TABLE content_drop_share_links
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS followup_count INT NOT NULL DEFAULT 0;

-- Backfill existing rows: treat the original send (when the link was
-- created) as the start of the followup clock. Otherwise legacy links
-- would show "—" forever and the days-since indicator wouldn't fire.
UPDATE content_drop_share_links
   SET last_followup_at = created_at
 WHERE last_followup_at IS NULL;

COMMENT ON COLUMN content_drop_share_links.last_followup_at IS
  'Timestamp of the most recent admin followup email (or original send for new links). Used by /review to render the days-since indicator and color.';
COMMENT ON COLUMN content_drop_share_links.followup_count IS
  'Number of admin-triggered followup emails sent for this share link. Initial send is not counted; only subsequent nudges are.';
