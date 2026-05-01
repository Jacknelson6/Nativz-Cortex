-- Atomic dedup gate for the "🎉 all posts approved" Google Chat notification.
-- Two concurrent approvers (or a single double-click) used to race past a
-- non-atomic SELECT and post the celebration message twice. We now claim the
-- right to send via UPDATE ... WHERE all_approved_notified_at IS NULL — only
-- the request that flips NULL → timestamp wins and posts. Cleared when an
-- approval is deleted so a future re-approval can fire again.
ALTER TABLE content_drop_share_links
  ADD COLUMN IF NOT EXISTS all_approved_notified_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN content_drop_share_links.all_approved_notified_at IS
  'Timestamp the "all posts approved" celebration notification was sent for '
  'this share link. Set atomically (WHERE col IS NULL) to dedup concurrent '
  'approvers. Cleared when an approval comment is deleted so re-approval '
  'fires again.';
