-- ──────────────────────────────────────────────────────────────────────
-- 196: Mux video hosting + timestamped comments
-- ──────────────────────────────────────────────────────────────────────
-- Why this exists:
--   1. The /c/[token] revision re-upload kept failing on Vercel's 4.5MB body
--      limit — videos almost always exceed it. Switching to Mux direct uploads
--      bypasses the platform proxy entirely (browser → Mux).
--   2. While we're swapping the storage layer, we add timestamped comments
--      so editors can leave feedback anchored to specific moments in the cut
--      ("at 0:14 the audio cuts off"). The player seeks to the timestamp on
--      click.
--
-- All additive. Legacy uploads (revised_video_url / video_url) keep working;
-- the player picks Mux when mux_playback_id is present, otherwise falls back
-- to the existing <video> element pointing at Supabase Storage.
-- ──────────────────────────────────────────────────────────────────────

-- (1) Mux state on each post's video row.
--   * mux_upload_id   — returned by mux.video.uploads.create(); the browser
--                       PUTs bytes against the URL Mux gave us. Lets us
--                       reconcile the upload row with the eventual asset.
--   * mux_asset_id    — set by the video.asset.created webhook.
--   * mux_playback_id — set by the video.asset.ready webhook. This is the ID
--                       the <MuxPlayer> takes; safe to render publicly when
--                       playback policy is "public".
--   * mux_status      — coarse state machine: 'pending' | 'uploading' |
--                       'processing' | 'ready' | 'errored'. Drives the UI
--                       between "uploading…" / "Mux is processing…" / play.
ALTER TABLE content_drop_videos
  ADD COLUMN IF NOT EXISTS mux_upload_id   TEXT NULL,
  ADD COLUMN IF NOT EXISTS mux_asset_id    TEXT NULL,
  ADD COLUMN IF NOT EXISTS mux_playback_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS mux_status      TEXT NULL;

COMMENT ON COLUMN content_drop_videos.mux_upload_id   IS 'Mux direct-upload id (mux.video.uploads.create). Used to look the row up from the webhook.';
COMMENT ON COLUMN content_drop_videos.mux_asset_id    IS 'Mux asset id, set by video.asset.created webhook.';
COMMENT ON COLUMN content_drop_videos.mux_playback_id IS 'Mux public playback id; only set once the asset is ready.';
COMMENT ON COLUMN content_drop_videos.mux_status      IS 'pending | uploading | processing | ready | errored. Drives UI state on /c/[token].';

-- Lookup index — webhook handler queries by upload id, then by asset id.
CREATE INDEX IF NOT EXISTS content_drop_videos_mux_upload_id_idx
  ON content_drop_videos (mux_upload_id) WHERE mux_upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_drop_videos_mux_asset_id_idx
  ON content_drop_videos (mux_asset_id)  WHERE mux_asset_id  IS NOT NULL;

-- (2) Timestamped comments — anchor a review note to a moment in the cut.
-- NULL means the comment is general (current behavior). Stored as fractional
-- seconds so we can pin sub-second moments if we ever want to.
ALTER TABLE post_review_comments
  ADD COLUMN IF NOT EXISTS timestamp_seconds NUMERIC(10, 3) NULL;

COMMENT ON COLUMN post_review_comments.timestamp_seconds IS
  'When non-null, the comment is anchored to this point in the video. Click-to-seek in the player. NULL = general comment (default).';
