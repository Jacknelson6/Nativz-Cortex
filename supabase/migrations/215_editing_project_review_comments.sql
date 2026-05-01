-- Migration 215: Public-review comments for editing projects.
--
-- Mirrors `post_review_comments` (the social-drop review thread) but
-- lives in its own table because editing projects don't have a content
-- drop / scheduled posts to anchor against. A comment is anchored to
-- the project, optionally to a specific edited video (so a reviewer
-- can pin notes to a clip), and optionally to a wall-clock second
-- inside that video for frame.io-style timestamped feedback.
--
-- Anonymous reviewers post via the public share token; admins can also
-- post (as themselves) from the admin detail dialog. We keep the
-- author_name as free text so anon comments still attribute correctly.
--
-- Status values mirror the social side (`approved`, `changes_requested`,
-- `comment`) plus an internal `video_revised` event we synthesise when
-- an admin replaces a clip via the public page (so the activity feed
-- stays a single source of truth without poking at the videos table).
--
-- Attachments + metadata are JSONB to match `post_review_comments`,
-- letting the client send the same upload + render code path without
-- a second schema. The `share-comment-attachments` bucket from
-- migration 182 is reused as-is.

CREATE TABLE IF NOT EXISTS editing_project_review_comments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID NOT NULL REFERENCES editing_projects(id) ON DELETE CASCADE,
  -- Nullable so a comment can pin to the whole project instead of a
  -- specific clip (e.g. "Approve all" emits a project-level approval).
  video_id           UUID NULL REFERENCES editing_project_videos(id) ON DELETE CASCADE,
  -- Which share link the comment came through, if any. Lets us audit
  -- "this approval came from the public link, not an admin post" and
  -- gives us a path to revoke / archive a session's comments later.
  share_link_id      UUID NULL REFERENCES editing_project_share_links(id) ON DELETE SET NULL,
  -- Free-text author. Anon reviewers store their captured name; admin
  -- posts use the user's display name. Keeping it text (not an FK)
  -- means deleting an admin doesn't blow away history.
  author_name        TEXT NOT NULL DEFAULT 'Anonymous',
  -- Optional FK back to the admin who authored the comment (NULL for
  -- public-token authors). Lets the activity feed render avatars when
  -- we have one.
  author_user_id     UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  content            TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'comment'
    CHECK (status IN ('approved', 'changes_requested', 'comment', 'video_revised')),
  attachments        JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Frame-accurate timestamp inside the video, in seconds. NULL means
  -- the comment is general (top of the thread), not pinned to a frame.
  timestamp_seconds  NUMERIC(10,3) NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup helpers: project-level activity feed, per-video thread, and
-- "what came in through this share link" auditing.
CREATE INDEX IF NOT EXISTS editing_project_review_comments_project_idx
  ON editing_project_review_comments (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS editing_project_review_comments_video_idx
  ON editing_project_review_comments (video_id, created_at ASC)
  WHERE video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS editing_project_review_comments_share_link_idx
  ON editing_project_review_comments (share_link_id, created_at DESC)
  WHERE share_link_id IS NOT NULL;

ALTER TABLE editing_project_review_comments ENABLE ROW LEVEL SECURITY;

-- Admins can do anything with the table from the dashboard.
DROP POLICY IF EXISTS editing_project_review_comments_admin_all
  ON editing_project_review_comments;
CREATE POLICY editing_project_review_comments_admin_all
  ON editing_project_review_comments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = true)
    )
  );

-- Anonymous read/insert is intentionally NOT exposed via RLS. The
-- public share endpoints all run through `createAdminClient()` and
-- gate access by validating the share token + expiry server-side, so
-- there's no path that needs the anon role to touch this table.

COMMENT ON TABLE editing_project_review_comments IS
  'frame.io-style review comments on editing project videos. Posted from the public share page (anonymous, gated by token) or from the admin detail dialog. video_id is nullable so project-wide events (approve-all, revisions) can still live in one feed.';
COMMENT ON COLUMN editing_project_review_comments.timestamp_seconds IS
  'Wall-clock seconds inside the video the comment is pinned to. NULL = unpinned / general comment.';
COMMENT ON COLUMN editing_project_review_comments.status IS
  'comment | approved | changes_requested | video_revised. video_revised is synthesised when an admin replaces a clip via the public review page.';
