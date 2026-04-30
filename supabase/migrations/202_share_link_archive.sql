-- 202_share_link_archive.sql
--
-- Soft-delete column for `content_drop_share_links`. Right-clicking a row
-- in the Projects table sets `archived_at`, which makes the row stop
-- surfacing in `/api/calendar/review` without touching the underlying
-- drop, posts, or comments. Independent of `abandoned_at` (status flag)
-- and `expires_at` (token TTL).
--
-- Why a column instead of a delete: the row carries the share token,
-- post mapping, and comment history. Hard-deleting would orphan
-- comments and break any cached client links. Archive is recoverable
-- by clearing the column.

ALTER TABLE content_drop_share_links
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN content_drop_share_links.archived_at IS
  'Soft-delete stamp. When set, the row is hidden from the Projects '
  'review table. Drop, posts, and comments stay intact so the share '
  'token still resolves if the client opens it directly.';

CREATE INDEX IF NOT EXISTS idx_content_drop_share_links_archived_at
  ON content_drop_share_links (archived_at)
  WHERE archived_at IS NULL;
