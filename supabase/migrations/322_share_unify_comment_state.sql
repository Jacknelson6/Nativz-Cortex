-- Migration 322: unify comment state on share threads.
--
-- The v2 stack (PRDs 01-08) split intent across two columns:
--   * `status`: 'approved' | 'changes_requested' | 'comment' | ...
--   * `kind':   'revision' | 'feedback' | 'admin_response' | 'approval' | 'video_revised'
--
-- In practice this turned out to be too many states. The product
-- decision is to collapse "comment" and "request changes" into one:
-- a comment without Approve = revision needed; comment + Approve =
-- approved with notes. Admin-vs-viewer distinction is now derived at
-- render time from the existing `author_role` column (added in 319),
-- so we no longer need a separate `admin_response` kind.
--
-- This migration:
--   1. Rewrites legacy rows so they fit the new vocabulary.
--   2. Tightens the CHECK constraints so future writes can only use
--      the simplified values.
--   3. Drops the per-revision `resolved_at` column + the open-revisions
--      indexes, plus the share-link-level `revisions_complete_notified_at`
--      counters that backed the now-defunct "revisions complete" email.
--
-- Activity events (caption_edit / tag_edit / schedule_change /
-- video_revised / cover_edit) stay in the status enum because they're
-- still emitted by admin actions and consumed by the activity feed.

-- 1. Backfill existing rows ------------------------------------------------

-- Treat any existing changes_requested as a plain comment. We keep the
-- text + attachments untouched; only the lifecycle flag flips.
UPDATE post_review_comments
SET status = 'comment'
WHERE status = 'changes_requested';

UPDATE editing_project_review_comments
SET status = 'comment'
WHERE status = 'changes_requested';

-- Collapse legacy `kind` values onto `feedback` (the catch-all for
-- "a thing someone wrote"). Admin-ness comes from author_role now.
UPDATE post_review_comments
SET kind = 'feedback'
WHERE kind IN ('revision', 'admin_response');

UPDATE editing_project_review_comments
SET kind = 'feedback'
WHERE kind IN ('revision', 'admin_response');

-- Wipe the resolved tracking out of metadata + the dedicated column.
-- The "send back for re-review" admin action replaces this surface.
UPDATE post_review_comments
SET metadata = metadata - 'resolved' - 'resolved_at' - 'resolved_by'
WHERE metadata ?| ARRAY['resolved','resolved_at','resolved_by'];

UPDATE editing_project_review_comments
SET metadata = metadata - 'resolved' - 'resolved_at' - 'resolved_by'
WHERE metadata ?| ARRAY['resolved','resolved_at','resolved_by'];

-- 2. Tighten constraints ---------------------------------------------------

ALTER TABLE post_review_comments
  DROP CONSTRAINT IF EXISTS post_review_comments_status_check;

ALTER TABLE post_review_comments
  ADD CONSTRAINT post_review_comments_status_check
  CHECK (status = ANY (ARRAY[
    'approved'::text,
    'comment'::text,
    'caption_edit'::text,
    'tag_edit'::text,
    'schedule_change'::text,
    'video_revised'::text,
    'cover_edit'::text
  ]));

ALTER TABLE editing_project_review_comments
  DROP CONSTRAINT IF EXISTS editing_project_review_comments_status_check;

ALTER TABLE editing_project_review_comments
  ADD CONSTRAINT editing_project_review_comments_status_check
  CHECK (status IN ('approved', 'comment', 'video_revised'));

ALTER TABLE post_review_comments
  DROP CONSTRAINT IF EXISTS post_review_comments_kind_check;

ALTER TABLE post_review_comments
  ADD CONSTRAINT post_review_comments_kind_check
  CHECK (kind IN ('feedback', 'approval', 'video_revised'));

ALTER TABLE editing_project_review_comments
  DROP CONSTRAINT IF EXISTS editing_project_review_comments_kind_check;

ALTER TABLE editing_project_review_comments
  ADD CONSTRAINT editing_project_review_comments_kind_check
  CHECK (kind IN ('feedback', 'approval', 'video_revised'));

-- 3. Drop the resolved-revision surface -----------------------------------

DROP INDEX IF EXISTS idx_post_review_comments_open_revisions;
DROP INDEX IF EXISTS idx_editing_project_review_comments_open_revisions;
DROP INDEX IF EXISTS idx_post_review_comments_kind;
DROP INDEX IF EXISTS idx_editing_project_review_comments_kind;

ALTER TABLE post_review_comments
  DROP COLUMN IF EXISTS resolved_at;

ALTER TABLE editing_project_review_comments
  DROP COLUMN IF EXISTS resolved_at;

-- Per-share-link notification dedupe counters for "all revisions
-- complete" email. The send-back-for-re-review admin action replaces
-- this whole notion, so the column has no readers left.
ALTER TABLE content_drop_share_links
  DROP COLUMN IF EXISTS revisions_complete_notified_at;

ALTER TABLE editing_project_share_links
  DROP COLUMN IF EXISTS revisions_complete_notified_at;

-- 4. Recreate kind index without the now-defunct `kind = 'revision'`
-- predicate. Lookups still hit (review_link_id, kind), just over the
-- smaller value set.
CREATE INDEX IF NOT EXISTS idx_post_review_comments_kind
  ON post_review_comments (review_link_id, kind);

CREATE INDEX IF NOT EXISTS idx_editing_project_review_comments_kind
  ON editing_project_review_comments (share_link_id, kind)
  WHERE share_link_id IS NOT NULL;

-- 5. Bell coalesce columns ------------------------------------------------
--
-- Mirror `chat_notified_at` for the in-app bell so per-admin pings can
-- ride the same 20-min quiet window the Google Chat cards already use.
-- The comment routes leave the column NULL on insert; the coalesce cron
-- drains it after the window elapses, stamps every batched row, and
-- emits ONE bell notification per admin per share-link.
ALTER TABLE post_review_comments
  ADD COLUMN IF NOT EXISTS bell_notified_at TIMESTAMPTZ NULL;
ALTER TABLE editing_project_review_comments
  ADD COLUMN IF NOT EXISTS bell_notified_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_post_review_comments_bell_pending
  ON post_review_comments (created_at)
  WHERE bell_notified_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_editing_project_review_comments_bell_pending
  ON editing_project_review_comments (created_at)
  WHERE bell_notified_at IS NULL;

COMMENT ON COLUMN post_review_comments.bell_notified_at IS
  'Set by /api/cron/coalesce-review-pings when this row has been folded into a per-admin in-app bell ping. NULL = still pending. Mirrors chat_notified_at.';
COMMENT ON COLUMN editing_project_review_comments.bell_notified_at IS
  'Set by /api/cron/coalesce-review-pings when this row has been folded into a per-admin in-app bell ping. NULL = still pending. Mirrors chat_notified_at.';

-- 6. Refresh column comments to match the new semantics.
COMMENT ON COLUMN post_review_comments.status IS
  'approved | comment | activity event. changes_requested was folded into comment in migration 322; revision intent is implied by the absence of an approval.';
COMMENT ON COLUMN editing_project_review_comments.status IS
  'approved | comment | video_revised. changes_requested was folded into comment in migration 322.';
COMMENT ON COLUMN post_review_comments.kind IS
  'feedback | approval | video_revised. Admin-vs-viewer is derived from author_role at render time. revision + admin_response were removed in migration 322.';
COMMENT ON COLUMN editing_project_review_comments.kind IS
  'feedback | approval | video_revised. Admin-vs-viewer is derived from author_role at render time. revision + admin_response were removed in migration 322.';
