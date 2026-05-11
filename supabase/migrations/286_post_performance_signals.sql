-- ============================================================
-- ZNA-05: Per-post good/bad signal vs brand-and-platform baseline.
-- One row per post_metric. Computed lazily on grid load; refresh 24h.
-- ============================================================

CREATE TABLE IF NOT EXISTS post_performance_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_metric_id UUID NOT NULL REFERENCES post_metrics(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','facebook','youtube')),
  signal TEXT NOT NULL CHECK (signal IN ('above_avg','avg','below_avg','too_fresh')),
  ratio NUMERIC(8,3),
  views_count INTEGER NOT NULL,
  baseline_mean NUMERIC(12,2),
  baseline_sample_size INTEGER NOT NULL,
  baseline_window_days INTEGER NOT NULL DEFAULT 30,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  CONSTRAINT post_performance_signals_unique UNIQUE (post_metric_id)
);

CREATE INDEX IF NOT EXISTS idx_post_performance_signals_client_signal
  ON post_performance_signals(client_id, signal);
CREATE INDEX IF NOT EXISTS idx_post_performance_signals_stale
  ON post_performance_signals(computed_at);

ALTER TABLE post_performance_signals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY post_performance_signals_admin_all ON post_performance_signals
    FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin','super_admin')
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin','super_admin')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY post_performance_signals_viewer_read ON post_performance_signals
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'viewer'
        AND users.organization_id = post_performance_signals.organization_id
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
