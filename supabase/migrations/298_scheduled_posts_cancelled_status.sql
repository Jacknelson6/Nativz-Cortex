-- Allow 'cancelled' status on scheduled_posts.
--
-- Zernio fires `post.cancelled` when an operator cancels the post in the
-- Zernio dashboard, or when the platform refuses scheduling outright. The
-- webhook handler now mirrors that into the local row so the calendar
-- reflects reality. Without expanding the CHECK constraint the update
-- would silently fail with `violates check constraint
-- scheduled_posts_status_check` and the row would stay `scheduled` forever.

ALTER TABLE scheduled_posts
  DROP CONSTRAINT IF EXISTS scheduled_posts_status_check;

ALTER TABLE scheduled_posts
  ADD CONSTRAINT scheduled_posts_status_check
  CHECK (status IN (
    'draft',
    'scheduled',
    'publishing',
    'published',
    'partially_failed',
    'failed',
    'cancelled'
  ));
