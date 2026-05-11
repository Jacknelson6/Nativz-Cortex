-- Migration 301: Let the calendar create drops from a direct-upload batch.
--
-- Background: until now `content_drops.source` was either `drive_drop`
-- (the original Google Drive folder ingest) or `calendar_share` (synthetic
-- rows minted by the calendar Share button, migration 262). The Upload
-- Content modal now lets Jack pick files off his laptop instead of
-- pasting a Drive folder URL, so we need a third source value to mark
-- those rows. Existing rows are untouched; only the CHECK constraint
-- widens.
--
-- Rows with source='direct_upload' have the same shape as drive_drop rows
-- but with `drive_folder_url`/`drive_folder_id` left NULL (migration 262
-- already dropped the NOT NULL there). Their `content_drop_videos`
-- children also have NULL `drive_file_id`/`drive_file_name` -- ingest
-- short-circuits the Drive download because the files are already in
-- Supabase Storage.

ALTER TABLE content_drops
  DROP CONSTRAINT IF EXISTS content_drops_source_check;

ALTER TABLE content_drops
  ADD CONSTRAINT content_drops_source_check
    CHECK (source IN ('drive_drop', 'calendar_share', 'direct_upload'));

COMMENT ON COLUMN content_drops.source IS
  'drive_drop = ingested from a Google Drive folder (the original flow). calendar_share = synthetic row minted by the calendar Share button so the rich /c/{token} viewer can show free-form post selections that are not tied to a Drive ingest. direct_upload = files were uploaded straight from the browser via the Upload Content modal; no Drive backing.';
