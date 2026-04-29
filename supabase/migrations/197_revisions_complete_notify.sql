-- Track when we sent the "all revisions complete — please re-review" ping for
-- a share link. Set when the editor marks the last `changes_requested`
-- comment as resolved. Cleared when an editor un-marks one (transition back
-- to having unresolved revisions) so the next completion fires again.
ALTER TABLE content_drop_share_links
  ADD COLUMN IF NOT EXISTS revisions_complete_notified_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN content_drop_share_links.revisions_complete_notified_at IS
  'Timestamp the "all revisions are ready, please re-review" notification was '
  'sent for this share link. Used to dedup the trigger so toggling resolve flags '
  'does not spam the client chat. Cleared when unresolved count goes back above 0.';
