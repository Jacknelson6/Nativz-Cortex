-- Coalesce client review-comment chat pings.
--
-- Each individual comment ("Ana requested changes…") used to fire its own
-- Google Chat card the instant it was inserted. A client leaving five quick
-- revision notes spammed five cards in a row.
--
-- New flow: insert-time chat posts are skipped for `comment` and
-- `changes_requested` statuses. A 5-minute cron
-- (`/api/cron/coalesce-review-pings`) scans for un-notified comments whose
-- earliest entry is ≥20 min old per share-link, fires one batched card
-- listing every revision in that window, then stamps `chat_notified_at` on
-- the batch so it never re-fires.
--
-- Approved + all-approved + revisions-complete still fire immediately; those
-- aren't the spammy events.

ALTER TABLE post_review_comments
  ADD COLUMN IF NOT EXISTS chat_notified_at timestamptz NULL;

COMMENT ON COLUMN post_review_comments.chat_notified_at IS
  'Stamped when this comment was included in a batched chat-card ping. NULL = pending. Set by /api/cron/coalesce-review-pings.';

CREATE INDEX IF NOT EXISTS idx_post_review_comments_pending_chat
  ON post_review_comments (review_link_id, created_at)
  WHERE chat_notified_at IS NULL;

ALTER TABLE editing_project_review_comments
  ADD COLUMN IF NOT EXISTS chat_notified_at timestamptz NULL;

COMMENT ON COLUMN editing_project_review_comments.chat_notified_at IS
  'Stamped when this comment was included in a batched chat-card ping. NULL = pending. Set by /api/cron/coalesce-review-pings.';

CREATE INDEX IF NOT EXISTS idx_editing_review_comments_pending_chat
  ON editing_project_review_comments (share_link_id, created_at)
  WHERE chat_notified_at IS NULL;
