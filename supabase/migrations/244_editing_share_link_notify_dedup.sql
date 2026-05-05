-- Editing-side counterparts to migrations 197 + 219. Same atomic-claim + clear-on-regress
-- pattern, applied to editing share links so the editing surface gets the same
-- "all approved" celebration ping and "revisions complete" re-review trigger as calendar
-- without spamming on toggles or racing concurrent approvers.

ALTER TABLE editing_project_share_links
  ADD COLUMN IF NOT EXISTS all_approved_notified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS revisions_complete_notified_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN editing_project_share_links.all_approved_notified_at IS
  'Timestamp the "all videos approved" celebration notification was sent for '
  'this editing share link. Set atomically (WHERE col IS NULL) to dedup '
  'concurrent approvers. Cleared when an approval comment is deleted so '
  're-approval fires again.';

COMMENT ON COLUMN editing_project_share_links.revisions_complete_notified_at IS
  'Timestamp the "all revisions are ready, please re-review" notification was '
  'sent for this editing share link. Used to dedup the trigger so toggling '
  'resolve flags does not spam the client. Cleared when unresolved count goes '
  'back above 0.';
