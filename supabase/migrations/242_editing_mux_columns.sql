-- ──────────────────────────────────────────────────────────────────────
-- 242: Mux columns on editing-project video tables
-- ──────────────────────────────────────────────────────────────────────
-- Mirrors migration 196 (which added Mux state to content_drop_videos)
-- onto the editing-project tables. Editing-project uploads are moving off
-- Supabase Storage and onto Mux for the same reason the SMM revision
-- flow did: Vercel's 4.5MB body limit makes server-proxied uploads
-- unreliable, and we want HLS playback + per-asset MP4 renditions for
-- the publish cron.
--
-- Both tables get the same 4-column shape:
--   * mux_upload_id   — id from mux.video.uploads.create(); the browser
--                       PUTs bytes against the URL Mux returns. Lets us
--                       reconcile the upload row with the eventual asset.
--   * mux_asset_id    — set by video.asset.created (or .ready) webhook.
--   * mux_playback_id — set by video.asset.ready webhook. The id MuxPlayer
--                       consumes; safe to render publicly.
--   * mux_status      — pending | uploading | processing | ready | errored.
--
-- All additive. Existing rows that still point at storage_path/public_url
-- keep working; the player picks Mux when mux_playback_id is present and
-- falls back to <video src=public_url> otherwise during the migration.
-- ──────────────────────────────────────────────────────────────────────

-- (1) Editor cuts — the rows clients review on the share link.
ALTER TABLE editing_project_videos
  ADD COLUMN IF NOT EXISTS mux_upload_id   TEXT NULL,
  ADD COLUMN IF NOT EXISTS mux_asset_id    TEXT NULL,
  ADD COLUMN IF NOT EXISTS mux_playback_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS mux_status      TEXT NULL;

COMMENT ON COLUMN editing_project_videos.mux_upload_id   IS 'Mux direct-upload id (mux.video.uploads.create). Used to look the row up from the webhook before the asset id arrives.';
COMMENT ON COLUMN editing_project_videos.mux_asset_id    IS 'Mux asset id, set by video.asset.created webhook.';
COMMENT ON COLUMN editing_project_videos.mux_playback_id IS 'Mux public playback id; only set once the asset is ready.';
COMMENT ON COLUMN editing_project_videos.mux_status      IS 'pending | uploading | processing | ready | errored. Drives the cut card UI.';

CREATE INDEX IF NOT EXISTS editing_project_videos_mux_upload_id_idx
  ON editing_project_videos (mux_upload_id) WHERE mux_upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS editing_project_videos_mux_asset_id_idx
  ON editing_project_videos (mux_asset_id)  WHERE mux_asset_id  IS NOT NULL;

-- (2) Raw footage — source clips from the videographer, surfaced to the
-- editor on the project detail panel. Same Mux shape; same webhook path.
ALTER TABLE editing_project_raw_videos
  ADD COLUMN IF NOT EXISTS mux_upload_id   TEXT NULL,
  ADD COLUMN IF NOT EXISTS mux_asset_id    TEXT NULL,
  ADD COLUMN IF NOT EXISTS mux_playback_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS mux_status      TEXT NULL;

COMMENT ON COLUMN editing_project_raw_videos.mux_upload_id   IS 'Mux direct-upload id (mux.video.uploads.create).';
COMMENT ON COLUMN editing_project_raw_videos.mux_asset_id    IS 'Mux asset id, set by video.asset.created webhook.';
COMMENT ON COLUMN editing_project_raw_videos.mux_playback_id IS 'Mux public playback id; only set once the asset is ready.';
COMMENT ON COLUMN editing_project_raw_videos.mux_status      IS 'pending | uploading | processing | ready | errored.';

CREATE INDEX IF NOT EXISTS editing_project_raw_videos_mux_upload_id_idx
  ON editing_project_raw_videos (mux_upload_id) WHERE mux_upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS editing_project_raw_videos_mux_asset_id_idx
  ON editing_project_raw_videos (mux_asset_id)  WHERE mux_asset_id  IS NOT NULL;
