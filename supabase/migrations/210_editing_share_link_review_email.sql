-- Migration 210: Track when an editing share link last had a review
-- email sent (delivery or re-review).
--
-- The editing detail dialog needs to know "is the next send a delivery
-- or a re-review?" so it can pick the right subject + copy and surface
-- a count of cuts uploaded since the last send. Cheapest signal: stamp
-- the share-link row each time we send, then compute pending revisions
-- as "videos on this project where version > 1 AND created_at >
-- last_review_email_sent_at."
--
-- Null = no review email ever sent (so the button is "Send delivery").
-- Non-null = at least one delivery has gone out, so the button becomes
-- "Send re-review" once new revisions land.

ALTER TABLE editing_project_share_links
  ADD COLUMN IF NOT EXISTS last_review_email_sent_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS editing_project_share_links_last_review_idx
  ON editing_project_share_links (project_id, last_review_email_sent_at DESC NULLS FIRST);

COMMENT ON COLUMN editing_project_share_links.last_review_email_sent_at IS
  'Most recent time the admin sent a delivery or re-review email for '
  'this link. Null until the first send. Used by the detail dialog to '
  'pick "Send delivery" vs "Send re-review" copy + count revisions '
  'uploaded since the last send.';
