-- Per-post revision-complete markers + revised-video tracking.
--
-- post_review_links.revisions_completed_at  → admin stamps when all
--   changes_requested on this post have been addressed. Used by the
--   reminder cron's ball-in-court check and by the share view to surface
--   "revisions complete" to the client.
-- content_drop_videos.revised_video_url     → admin re-upload of the
--   revised cut. The share link plays this when present, falling back to
--   the original Drive file.

ALTER TABLE post_review_links
  ADD COLUMN IF NOT EXISTS revisions_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revisions_completed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS post_review_links_revisions_completed_at_idx
  ON post_review_links (revisions_completed_at)
  WHERE revisions_completed_at IS NOT NULL;

ALTER TABLE content_drop_videos
  ADD COLUMN IF NOT EXISTS revised_video_url TEXT,
  ADD COLUMN IF NOT EXISTS revised_video_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revised_video_uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL;
