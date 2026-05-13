-- Add `cover_edit` to the post_review_comments status enum so the share-link
-- "Edit cover" affordance can write activity entries the same way caption_edit
-- and tag_edit do.
ALTER TABLE post_review_comments
  DROP CONSTRAINT IF EXISTS post_review_comments_status_check;

ALTER TABLE post_review_comments
  ADD CONSTRAINT post_review_comments_status_check
  CHECK (status = ANY (ARRAY[
    'approved'::text,
    'changes_requested'::text,
    'comment'::text,
    'caption_edit'::text,
    'tag_edit'::text,
    'schedule_change'::text,
    'video_revised'::text,
    'cover_edit'::text
  ]));
