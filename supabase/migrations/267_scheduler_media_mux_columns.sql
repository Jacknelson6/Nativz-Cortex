-- 267: Mux columns on scheduler_media so UI-uploaded videos can be stored on
-- Mux instead of Zernio's temp CDN. Zernio's /temp/ URLs TTL out mid IG
-- container-creation for big files, which is why IG silently stalls while
-- TT/YT/FB succeed. Mux gives us a permanent CDN URL plus 1080p compression
-- (614 MB → 75 MB on the May 8 Skibell Mother's Day reel).
--
-- Columns mirror the ones on content_drop_videos / editing_project_videos so
-- the existing /api/mux/webhook handler can dispatch into scheduler_media
-- with the same patches it already applies to the video tables.

ALTER TABLE scheduler_media
  ADD COLUMN IF NOT EXISTS mux_upload_id text,
  ADD COLUMN IF NOT EXISTS mux_asset_id text,
  ADD COLUMN IF NOT EXISTS mux_playback_id text,
  ADD COLUMN IF NOT EXISTS mux_status text;

CREATE INDEX IF NOT EXISTS scheduler_media_mux_upload_idx
  ON scheduler_media (mux_upload_id) WHERE mux_upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scheduler_media_mux_asset_idx
  ON scheduler_media (mux_asset_id) WHERE mux_asset_id IS NOT NULL;
