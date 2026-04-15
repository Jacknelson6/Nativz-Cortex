-- ─────────────────────────────────────────────────────────────────────────
-- Migration 103 — Phase 2 of competitor benchmarking
--
-- One row per (benchmark, competitor, captured_at) — the recurring snapshot
-- the cron writes so we can chart follower/posting-cadence deltas over time
-- in Phase 3's analytics view. Deltas are stored on the row itself (vs. the
-- prior snapshot) so the analytics view doesn't need a window function on
-- every render.
--
-- Named `benchmark_snapshots` rather than `competitor_snapshots` to avoid
-- colliding with the older `competitor_snapshots` table used by
-- /api/analytics/competitors (different shape, different owner).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS benchmark_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID NOT NULL REFERENCES client_benchmarks(id) ON DELETE CASCADE,

  platform TEXT NOT NULL
    CHECK (platform IN ('tiktok','instagram','facebook','youtube')),
  username TEXT NOT NULL,
  profile_url TEXT,
  display_name TEXT,

  followers INTEGER,
  posts_count INTEGER,
  avg_views NUMERIC,
  engagement_rate NUMERIC,
  posting_frequency TEXT,

  followers_delta INTEGER,
  posts_count_delta INTEGER,
  avg_views_delta NUMERIC,
  engagement_rate_delta NUMERIC,

  new_posts JSONB DEFAULT '[]'::jsonb,
  raw_meta JSONB,
  scrape_error TEXT,

  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_snapshots_benchmark_time
  ON benchmark_snapshots(benchmark_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_benchmark_snapshots_handle_time
  ON benchmark_snapshots(benchmark_id, platform, username, captured_at DESC);

ALTER TABLE benchmark_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS benchmark_snapshots_admin_all ON benchmark_snapshots;
CREATE POLICY benchmark_snapshots_admin_all ON benchmark_snapshots
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS benchmark_snapshots_viewer_read ON benchmark_snapshots;
CREATE POLICY benchmark_snapshots_viewer_read ON benchmark_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM client_benchmarks cb
      JOIN user_client_access uca ON uca.client_id = cb.client_id
      WHERE cb.id = benchmark_snapshots.benchmark_id
        AND uca.user_id = auth.uid()
    )
  );

COMMENT ON TABLE benchmark_snapshots IS
  'Recurring per-competitor scrape results for each client_benchmarks row. Phase 2 of benchmarking.';
