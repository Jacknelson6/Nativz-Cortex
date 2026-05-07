-- Migration 259: Make content_drops accept "synthetic" drops minted from
-- the calendar's free-form Share button (not just Drive-folder ingests).
--
-- Background: the rich share-link viewer at /c/{token} reads from
-- content_drops + content_drop_videos. To replace the OLD lightweight
-- client_review_links flow on the calendar's Share button, we need to be
-- able to mint a content_drops row that is NOT backed by a Drive folder.
--
-- Changes:
--   1. Drop NOT NULL constraints on Drive-only columns so synthetic rows
--      can omit them. The existing Drive ingest path keeps populating
--      them; nothing changes for real drops.
--   2. Add `source` column with a CHECK so we can tell the two apart in
--      the admin UI / future analytics.
--   3. Drop NOT NULL on content_drop_videos.drive_file_id /
--      drive_file_name for the same reason.
--
-- Defaults are chosen so existing rows stay valid: source='drive_drop'
-- backfills every row inserted before this migration.

ALTER TABLE content_drops
  ALTER COLUMN drive_folder_url DROP NOT NULL,
  ALTER COLUMN drive_folder_id DROP NOT NULL,
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN end_date DROP NOT NULL;

ALTER TABLE content_drops
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'drive_drop'
    CHECK (source IN ('drive_drop', 'calendar_share'));

CREATE INDEX IF NOT EXISTS idx_content_drops_client_source
  ON content_drops(client_id, source);

ALTER TABLE content_drop_videos
  ALTER COLUMN drive_file_id DROP NOT NULL,
  ALTER COLUMN drive_file_name DROP NOT NULL;

COMMENT ON COLUMN content_drops.source IS
  'drive_drop = ingested from a Google Drive folder (the original flow). calendar_share = synthetic row minted by the calendar Share button so the rich /c/{token} viewer can show free-form post selections that are not tied to a Drive ingest.';
