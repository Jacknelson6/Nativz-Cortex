-- ============================================================
-- ZNA-04: Reliable thumbnails on post_metrics.
-- Adds storage-backed thumbnail URL + persistence bookkeeping.
-- Does NOT create a new posts table. postara_posts was dropped in 270.
-- ============================================================

ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS thumbnail_storage_url TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_persisted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thumbnail_persist_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thumbnail_persist_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thumbnail_source_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_post_metrics_thumbnail_missing
  ON post_metrics (client_id, published_at DESC)
  WHERE thumbnail_storage_url IS NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-thumbnails', 'post-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY post_thumbnails_public_read ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'post-thumbnails');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY post_thumbnails_service_write ON storage.objects
    FOR ALL TO service_role
    USING (bucket_id = 'post-thumbnails')
    WITH CHECK (bucket_id = 'post-thumbnails');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
