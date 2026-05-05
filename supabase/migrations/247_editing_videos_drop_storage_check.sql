-- ──────────────────────────────────────────────────────────────────────
-- 247: Drop storage_path/drive_file_id check on editing video tables
-- ──────────────────────────────────────────────────────────────────────
-- Migration 201 added a CHECK that required either `storage_path` or
-- `drive_file_id` on every row. Migration 242 introduced the Mux flow,
-- where neither column is set at insert time (the row gets `mux_upload_id`
-- and the bytes go straight to Mux). The check has been silently
-- blocking every Mux insert since 242 shipped, which is why no Mux-backed
-- editing video rows exist yet.
--
-- This migration also unblocks image uploads on the same tables: image
-- rows live in `scheduler-media` storage with `storage_path` + `public_url`
-- set and no Mux fields, but the new editing-images flow needs the
-- option for rows that bypass Mux entirely.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE editing_project_videos
  DROP CONSTRAINT IF EXISTS editing_project_videos_check;

ALTER TABLE editing_project_raw_videos
  DROP CONSTRAINT IF EXISTS editing_project_raw_videos_check;
