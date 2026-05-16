-- Migration 319: server-enforced author role on share-link comments (PRD 05).
--
-- Today comment rows store `author_name` (a client-supplied string) and, on
-- editing_project_review_comments, an optional `author_user_id`. There's no
-- canonical signal for "this comment came from an admin" that downstream
-- consumers (digest crons, audit queries, notification routing) can trust.
-- The client cannot be trusted with a role field; it must be derived from
-- the server's view of the session at write time.
--
-- This migration adds `author_role` (admin | viewer | guest) to both
-- comment tables and adds `author_user_id` to post_review_comments so the
-- calendar surface can carry the same identity signal the editing surface
-- already does. Backfill: rows with a resolvable user inherit their current
-- role from `users.role`; everything else defaults to 'guest'.

BEGIN;

-- 1. post_review_comments: add author_user_id (was absent on this table).
ALTER TABLE post_review_comments
  ADD COLUMN IF NOT EXISTS author_user_id UUID NULL
    REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. author_role on both tables.
ALTER TABLE post_review_comments
  ADD COLUMN IF NOT EXISTS author_role TEXT NOT NULL DEFAULT 'guest'
    CHECK (author_role IN ('admin', 'viewer', 'guest'));

ALTER TABLE editing_project_review_comments
  ADD COLUMN IF NOT EXISTS author_role TEXT NOT NULL DEFAULT 'guest'
    CHECK (author_role IN ('admin', 'viewer', 'guest'));

-- 3. Backfill from the user row when we have one. The editing table has
-- historical author_user_id values; the calendar table just got the column
-- so its backfill is a no-op (all rows default to 'guest').
UPDATE editing_project_review_comments c
SET author_role = CASE
  WHEN u.role IN ('admin', 'super_admin') THEN 'admin'
  WHEN u.role = 'viewer' THEN 'viewer'
  ELSE 'guest'
END
FROM public.users u
WHERE c.author_user_id IS NOT NULL
  AND u.id = c.author_user_id
  AND c.author_role = 'guest';

-- 4. Indexes for cheap admin-vs-client splits on the thread query path.
CREATE INDEX IF NOT EXISTS idx_post_review_comments_role
  ON post_review_comments (review_link_id, author_role);

CREATE INDEX IF NOT EXISTS idx_editing_project_review_comments_role
  ON editing_project_review_comments (share_link_id, author_role)
  WHERE share_link_id IS NOT NULL;

COMMENT ON COLUMN post_review_comments.author_role IS
  'PRD 05: server-enforced role of the comment author. admin | viewer | guest. Derived from the session at write time; client-supplied values are ignored.';
COMMENT ON COLUMN editing_project_review_comments.author_role IS
  'PRD 05: server-enforced role of the comment author. admin | viewer | guest.';
COMMENT ON COLUMN post_review_comments.author_user_id IS
  'PRD 05: Cortex user that posted this comment, when the session was bound to one. Null for guest authors.';

COMMIT;
