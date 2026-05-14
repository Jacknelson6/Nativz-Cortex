-- NAT-73: thread replies on share-link review comments.
--
-- Clients on a Cortex calendar share link previously had to file each new
-- piece of feedback as a top-level comment, even when responding to an
-- editor's reply. That made multi-turn threads (especially revision back-
-- and-forth) hard to follow and forced reviewers to copy/paste context.
--
-- A self-referential `parent_comment_id` lets a reply hang off any prior
-- comment in the same review thread. The shape mirrors how every other
-- thread surface in the app stores replies (one level of nesting,
-- ordered by created_at). We deliberately do NOT enforce same-review-link
-- containment at the DB level here -- the API layer validates the
-- relationship against `post_review_link_map` before insert, and the FK
-- already cascade-deletes orphans when a parent is removed.
ALTER TABLE post_review_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID
    REFERENCES post_review_comments(id) ON DELETE CASCADE;

-- Index supports the common read pattern: "given a parent, list its
-- replies in order." The share viewer groups replies under the parent in
-- the same render pass that already loads the flat comment list.
CREATE INDEX IF NOT EXISTS idx_post_review_comments_parent
  ON post_review_comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

COMMENT ON COLUMN post_review_comments.parent_comment_id IS
  'Self-FK for threaded replies on share-link comments. NULL for top-level rows. One level of nesting only; the API rejects replies-to-replies.';
