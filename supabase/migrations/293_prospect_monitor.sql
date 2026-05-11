-- ============================================================
-- SPY-06: Prospect recurring competitor monitor
-- Three tables: config + snapshots + alerts.
-- Renumbered from PRD's 281 -> 293 (291=SPY-04, 292=SPY-05).
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_monitor_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL UNIQUE REFERENCES prospects(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'weekly'
    CHECK (frequency IN ('weekly','biweekly')),
  day_of_week INTEGER NOT NULL DEFAULT 1 CHECK (day_of_week BETWEEN 0 AND 6),
  active BOOLEAN NOT NULL DEFAULT true,
  paused_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_config_active_dow
  ON prospect_monitor_config(day_of_week) WHERE active = true;

CREATE TABLE IF NOT EXISTS prospect_monitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  competitor_handle TEXT NOT NULL,
  competitor_platform TEXT NOT NULL
    CHECK (competitor_platform IN ('tiktok','instagram','youtube','facebook')),
  raw_metrics JSONB NOT NULL,
  workflow_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_prospect_time
  ON prospect_monitor_snapshots(prospect_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_pms_prospect_competitor_time
  ON prospect_monitor_snapshots(prospect_id, competitor_platform, competitor_handle, captured_at DESC);

CREATE TABLE IF NOT EXISTS prospect_monitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES prospect_monitor_snapshots(id) ON DELETE SET NULL,
  prior_snapshot_id UUID REFERENCES prospect_monitor_snapshots(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('follower_jump','viral_post','cadence_shift','format_pivot')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  message TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pma_prospect_time
  ON prospect_monitor_alerts(prospect_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pma_unack
  ON prospect_monitor_alerts(occurred_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pma_severity
  ON prospect_monitor_alerts(severity, occurred_at DESC);

DROP TRIGGER IF EXISTS trg_pm_config_updated ON prospect_monitor_config;
CREATE TRIGGER trg_pm_config_updated
  BEFORE UPDATE ON prospect_monitor_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE prospect_monitor_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_monitor_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_monitor_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pmc_admin_all ON prospect_monitor_config;
CREATE POLICY pmc_admin_all ON prospect_monitor_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS pms_admin_all ON prospect_monitor_snapshots;
CREATE POLICY pms_admin_all ON prospect_monitor_snapshots
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS pma_admin_all ON prospect_monitor_alerts;
CREATE POLICY pma_admin_all ON prospect_monitor_alerts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
