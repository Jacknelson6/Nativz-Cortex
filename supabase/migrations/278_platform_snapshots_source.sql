-- ============================================================
-- ZNA-01: Source attribution + error log for analytics sync.
-- Extends migration 021 (platform_snapshots, post_metrics).
-- Adds explicit source attribution so downstream PRDs (ZNA-02..06,
-- SPY-08) can tell where a given metric originated.
-- ============================================================

ALTER TABLE platform_snapshots
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'scrape'
    CHECK (source IN ('zernio','scrape','apify')),
  ADD COLUMN IF NOT EXISTS source_version TEXT,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Existing rows are scrape (the default covers this for new rows; explicit
-- statement here makes the intent clear if the column was added empty).
UPDATE platform_snapshots SET source = 'scrape' WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_platform_snapshots_source
  ON platform_snapshots(source);

-- Mirror on post_metrics for downstream symmetry (ZNA-04..06).
ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'scrape'
    CHECK (source IN ('zernio','scrape','apify')),
  ADD COLUMN IF NOT EXISTS source_version TEXT;

CREATE INDEX IF NOT EXISTS idx_post_metrics_source
  ON post_metrics(source);

-- Error log — replaces the old "swallow and move on" behavior with an
-- observable trail. One row per failed (client, profile, platform, source)
-- attempt within a sync run.
CREATE TABLE IF NOT EXISTS platform_snapshot_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  social_profile_id UUID REFERENCES social_profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','youtube')),
  attempted_source TEXT NOT NULL CHECK (attempted_source IN ('zernio','scrape','apify')),
  error_code TEXT,
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_snapshot_errors_client_time
  ON platform_snapshot_errors(client_id, attempted_at DESC);

ALTER TABLE platform_snapshot_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_snapshot_errors_admin_all ON platform_snapshot_errors;
CREATE POLICY platform_snapshot_errors_admin_all ON platform_snapshot_errors
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND (users.role IN ('admin','super_admin') OR users.is_super_admin = true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND (users.role IN ('admin','super_admin') OR users.is_super_admin = true)
  ));
