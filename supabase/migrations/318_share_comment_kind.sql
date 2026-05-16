-- Migration 318: comment kind on share threads (PRD 01).
--
-- The existing `status` column on `post_review_comments` and
-- `editing_project_review_comments` conflates author intent (revision vs
-- reaction) with lifecycle events (approval, video revised). Clients use
-- the "Request changes" composer for everything, so general feedback gets
-- counted as a revision and admins can't tell what actually needs work.
--
-- `kind` separates intent from status. The legacy `status` column stays in
-- place until PRD 09's cutover so v1 read paths keep working during the
-- rollout window. New comments are written with both columns; we drop
-- `status` once v2 has soaked.

BEGIN;

ALTER TABLE post_review_comments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'feedback'
    CHECK (kind IN ('revision', 'feedback', 'admin_response', 'approval', 'video_revised'));

ALTER TABLE editing_project_review_comments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'feedback'
    CHECK (kind IN ('revision', 'feedback', 'admin_response', 'approval', 'video_revised'));

-- Backfill from legacy `status`. Reply rows (parent_comment_id IS NOT NULL)
-- always read as feedback regardless of stored status, the calendar route
-- already forces status='comment' on replies, but the editing table doesn't
-- have that guarantee historically so the reply check is explicit here.
UPDATE post_review_comments
SET kind = CASE
  WHEN parent_comment_id IS NOT NULL THEN 'feedback'
  WHEN status = 'changes_requested' THEN 'revision'
  WHEN status = 'approved' THEN 'approval'
  ELSE 'feedback'
END
WHERE kind = 'feedback';

UPDATE editing_project_review_comments
SET kind = CASE
  WHEN status = 'changes_requested' THEN 'revision'
  WHEN status = 'approved' THEN 'approval'
  WHEN status = 'video_revised' THEN 'video_revised'
  ELSE 'feedback'
END
WHERE kind = 'feedback';

-- Open-revision lookups hit this index. The status-side equivalent already
-- exists implicitly through the review_link_id index, but kind-aware
-- counters need a dedicated path now that they're the source of truth.
CREATE INDEX IF NOT EXISTS idx_post_review_comments_kind
  ON post_review_comments (review_link_id, kind);

CREATE INDEX IF NOT EXISTS idx_editing_project_review_comments_kind
  ON editing_project_review_comments (share_link_id, kind)
  WHERE share_link_id IS NOT NULL;

COMMENT ON COLUMN post_review_comments.kind IS
  'PRD 01: author intent. revision | feedback | admin_response | approval | video_revised. Separates "what the author meant" from "lifecycle state."';
COMMENT ON COLUMN editing_project_review_comments.kind IS
  'PRD 01: author intent. revision | feedback | admin_response | approval | video_revised.';

COMMIT;
