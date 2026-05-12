-- Daily publish-pipeline SLO rollup.
--
-- The SLO: a scheduled post should publish within 5 minutes of its
-- scheduled_at. Anything outside that window degrades the user
-- experience (calendar slots shift, share-link viewers refresh into
-- empty grids).
--
-- This table is recomputed nightly by the publish-slo-rollup cron. Each
-- row is a Chicago-local day bucketing every scheduled_posts row whose
-- `scheduled_at` falls in that day, regardless of when the row was
-- created or which client owns it. Trends across days surface drift
-- before the user feels it.

CREATE TABLE IF NOT EXISTS publish_slo_daily (
  day date PRIMARY KEY,
  total int NOT NULL DEFAULT 0,
  published_in_window int NOT NULL DEFAULT 0,
  published_late int NOT NULL DEFAULT 0,
  failed_or_partial int NOT NULL DEFAULT 0,
  stuck int NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publish_slo_daily_day_desc
  ON publish_slo_daily (day DESC);

COMMENT ON TABLE publish_slo_daily IS
  'Daily SLO rollup: % of scheduled posts that publish within 5 minutes of scheduled_at, partitioned by the Chicago-local day of scheduled_at. Recomputed nightly; rows are upserts so a re-run heals drift.';

ALTER TABLE publish_slo_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "publish_slo_daily admin all"
  ON publish_slo_daily
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  );
