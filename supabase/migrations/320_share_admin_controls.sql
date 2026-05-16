-- Migration 320: PRD 06 admin operator controls on share pages.
--
-- Three structural additions land here so the share-scoped admin
-- endpoints can do their job:
--
--   1. `share_link_admin_actions` audit table. Every admin write that
--      lands through a share-scoped endpoint (replace content, change
--      cover, delete, mark revised, post admin response, login) logs a
--      row here. This is the trail-of-tears for "who touched this
--      review and when", and feeds the unified review modal.
--
--   2. `resolved_at` on both review-comment tables. Mark-revised closes
--      a single revision row at a time (PRD 06 §"Mark as revised"), so
--      we need a column on the revision itself. NULL = still open.
--
--   3. `archived_at` on `editing_project_videos`. The calendar surface
--      already has share-link soft-delete via `included_post_ids` /
--      `post_review_link_map` mutation, but editing videos are queried
--      straight from the project, so they need their own hide flag.
--      The underlying file + Mux asset stay intact; only the share-link
--      visibility is affected.

BEGIN;

-- 1. Audit table -----------------------------------------------------

CREATE TABLE IF NOT EXISTS share_link_admin_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id   UUID NOT NULL,
  share_link_kind TEXT NOT NULL CHECK (share_link_kind IN ('calendar', 'editing')),
  actor_user_id   UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  target_kind     TEXT NULL,
  target_id       UUID NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_link_admin_actions_link
  ON share_link_admin_actions (share_link_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_share_link_admin_actions_actor
  ON share_link_admin_actions (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

COMMENT ON TABLE share_link_admin_actions IS
  'PRD 06: audit trail for admin-only actions executed through a share-link surface (calendar or editing). One row per action; payload carries the action-specific context.';
COMMENT ON COLUMN share_link_admin_actions.action IS
  'Free-form action key. Known values: content.replace, cover.change, cover.reset, post.delete, video.delete, revision.mark_revised, comment.admin_response.create, auth.login, auth.login.failed.';
COMMENT ON COLUMN share_link_admin_actions.target_kind IS
  'Optional pointer to the entity the action affected: post, video, comment, revision.';

-- RLS: read access for admins only; writes always come from server-side
-- service-role inserts so we don't need INSERT policies for end users.
ALTER TABLE share_link_admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS share_link_admin_actions_admin_read ON share_link_admin_actions;
CREATE POLICY share_link_admin_actions_admin_read
  ON share_link_admin_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'super_admin')
    )
  );

-- 2. Per-revision resolution timestamps ------------------------------

ALTER TABLE post_review_comments
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL;

ALTER TABLE editing_project_review_comments
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_post_review_comments_open_revisions
  ON post_review_comments (review_link_id)
  WHERE kind = 'revision' AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_editing_project_review_comments_open_revisions
  ON editing_project_review_comments (video_id)
  WHERE kind = 'revision' AND resolved_at IS NULL;

COMMENT ON COLUMN post_review_comments.resolved_at IS
  'PRD 06: stamped when an admin marks this revision row complete. NULL = still open. Only meaningful when kind = revision.';
COMMENT ON COLUMN editing_project_review_comments.resolved_at IS
  'PRD 06: stamped when an admin marks this revision row complete. NULL = still open. Only meaningful when kind = revision.';

-- 2b. Parent-child threading on editing comments ----------------------
--
-- Calendar comments already have `parent_comment_id` from migration 313.
-- PRD 06's mark-revised flow writes a reply row hung off the revision,
-- so the editing side needs the same column.

ALTER TABLE editing_project_review_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID
    REFERENCES editing_project_review_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_editing_project_review_comments_parent
  ON editing_project_review_comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

COMMENT ON COLUMN editing_project_review_comments.parent_comment_id IS
  'PRD 06 / parity with post_review_comments: self-FK for replies. NULL = top-level.';

-- 3. Soft-delete for editing videos ----------------------------------

ALTER TABLE editing_project_videos
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS editing_project_videos_archived_idx
  ON editing_project_videos (project_id) WHERE archived_at IS NULL;

COMMENT ON COLUMN editing_project_videos.archived_at IS
  'PRD 06: soft-delete from the share-link visible set. Underlying Mux asset + row stay; share GET filters on this.';

COMMIT;
