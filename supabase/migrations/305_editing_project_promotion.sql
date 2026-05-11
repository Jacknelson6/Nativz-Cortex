-- Migration 303: Editing-project → calendar promotion
--
-- Adds the bookkeeping the "Promote to calendar" right-click action
-- needs: a timestamp on the editing project so the modal can swap its
-- footer once promoted, and a back-pointer on scheduled_posts so the
-- modal can list the scheduled dates that came out of the promotion.
--
-- We deliberately do NOT add a new value to editing_projects.status.
-- Promotion is orthogonal to the review lifecycle (the calendar share
-- link still drives need_approval / revising / approved). A column is
-- the right shape.

ALTER TABLE editing_projects
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN editing_projects.promoted_at IS
  'Set by /api/admin/editing/projects/[id]/promote-to-calendar when the '
  'project''s videos were minted as draft scheduled_posts on the content '
  'calendar. Drives the modal footer swap (Send delivery → Open in '
  'calendar) and surfaces the scheduled-dates list.';

ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS editing_project_id UUID NULL
    REFERENCES editing_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS scheduled_posts_editing_project_idx
  ON scheduled_posts(editing_project_id)
  WHERE editing_project_id IS NOT NULL;

COMMENT ON COLUMN scheduled_posts.editing_project_id IS
  'Set when this post was minted by promoting an editing project to the '
  'calendar. Lets the editing modal list the scheduled dates that came '
  'out of the promotion.';
