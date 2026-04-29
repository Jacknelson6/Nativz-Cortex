-- ──────────────────────────────────────────────────────────────────────
-- 195: Share-link collaboration upgrades
-- ──────────────────────────────────────────────────────────────────────
-- Powers four features that ship together (see SRL.md 2026-04-28 goal):
--   1. Tagged people + collaborators editable from /c/[token]
--   2. Editor re-upload of revised videos via the share link, with a
--      "notify client" toast that uses content_drop_videos.revised_video_notify_pending
--      to persist between renders.
--   3. New post_review_comments status types: 'tag_edit' (handle add/remove)
--      and 'schedule_change' (post date/time moved).
--   4. Client-side reschedule from the share link.
--
-- All additive. No data migration needed — `tagged_people` /
-- `collaborator_handles` already default to empty TEXT[] from migration 011.
-- ──────────────────────────────────────────────────────────────────────

-- (1) Toast persistence — pending until the editor clicks Notify or Skip.
ALTER TABLE content_drop_videos
  ADD COLUMN IF NOT EXISTS revised_video_notify_pending BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN content_drop_videos.revised_video_notify_pending IS
  'Set TRUE when an editor re-uploads a revised cut via the share link. Cleared when the editor clicks Notify (chat ping fires) or Skip (silent dismiss).';

-- (2) Extend the post_review_comments status enum so we can audit tag edits
-- and schedule changes the same way we already audit caption edits.
ALTER TABLE post_review_comments
  DROP CONSTRAINT IF EXISTS post_review_comments_status_check;

ALTER TABLE post_review_comments
  ADD CONSTRAINT post_review_comments_status_check
  CHECK (status IN (
    'approved',
    'changes_requested',
    'comment',
    'caption_edit',
    'tag_edit',
    'schedule_change',
    'video_revised'
  ));

-- (3) Extra metadata for the new status types.
-- - tag_edit:        action='add'|'remove', kind='tag'|'collab', handle='@somebody'
-- - schedule_change: previous_scheduled_at + next_scheduled_at
-- Stored in a single jsonb column so we don't need a column per status type.
ALTER TABLE post_review_comments
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_prc_metadata ON post_review_comments USING gin (metadata);

-- (4) Useful index for the share link's "any pending revised video" query —
-- avoids a full table scan when rendering the toast.
CREATE INDEX IF NOT EXISTS idx_cdv_revised_pending
  ON content_drop_videos (scheduled_post_id)
  WHERE revised_video_notify_pending = TRUE;
