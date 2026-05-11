-- ============================================================
-- ZNA-03: Daily AI analytics pulse per client.
-- One row per client per UTC day. Cron generates, admin/portal reads.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_analytics_pulses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pulse_date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  body TEXT NOT NULL,
  signal_metric TEXT NOT NULL CHECK (signal_metric IN
    ('followers','views_rolling_7d','engagements_rolling_7d','trend_reversal','cross_platform')),
  signal_value NUMERIC(8,2),
  platforms_referenced TEXT[] NOT NULL DEFAULT '{}',
  referenced_post_ids UUID[] NOT NULL DEFAULT '{}',
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES users(id),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES users(id),
  flagged_wrong_at TIMESTAMPTZ,
  flagged_wrong_by UUID REFERENCES users(id),
  flagged_wrong_reason TEXT,
  CONSTRAINT client_analytics_pulses_unique_per_day UNIQUE (client_id, pulse_date)
);

CREATE INDEX IF NOT EXISTS idx_client_analytics_pulses_client_date
  ON client_analytics_pulses(client_id, pulse_date DESC);
CREATE INDEX IF NOT EXISTS idx_client_analytics_pulses_org
  ON client_analytics_pulses(organization_id);

ALTER TABLE client_analytics_pulses ENABLE ROW LEVEL SECURITY;

-- Admins: full access.
CREATE POLICY client_analytics_pulses_admin_all ON client_analytics_pulses
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

-- Viewers (portal): read only, scoped to organization_id.
CREATE POLICY client_analytics_pulses_viewer_read ON client_analytics_pulses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'viewer'
      AND users.organization_id = client_analytics_pulses.organization_id
  ));
