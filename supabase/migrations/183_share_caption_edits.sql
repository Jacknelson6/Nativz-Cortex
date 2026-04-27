-- Allow reviewers on a public share link to edit captions inline. We log
-- each edit as a `post_review_comments` row with status='caption_edit' so
-- admins see a chronological audit trail (who changed it and when), while
-- the actual live caption is updated in `scheduled_posts.caption`.

ALTER TABLE post_review_comments
  DROP CONSTRAINT IF EXISTS post_review_comments_status_check;

ALTER TABLE post_review_comments
  ADD CONSTRAINT post_review_comments_status_check
  CHECK (status IN ('approved', 'changes_requested', 'comment', 'caption_edit'));

ALTER TABLE post_review_comments
  ADD COLUMN IF NOT EXISTS caption_before text,
  ADD COLUMN IF NOT EXISTS caption_after text;
