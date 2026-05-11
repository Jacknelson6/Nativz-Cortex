-- ============================================================
-- SPY-03: Initial profile analysis storage
-- One row per analysis run, keyed by (prospect_id, run_id).
-- Renumbered from PRD's 278 (taken by platform_snapshots_source)
-- to 290 to land after the most recent applied migration (289).
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  run_id UUID NOT NULL DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','youtube','facebook')),
  handle TEXT NOT NULL,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','succeeded','partial','failed')),
  error_message TEXT,
  duration_ms INTEGER,
  cost_cents INTEGER,

  -- Raw scraped/computed inputs (so we can re-render without re-scraping)
  raw_profile JSONB DEFAULT '{}'::jsonb,
  raw_captions JSONB DEFAULT '[]'::jsonb,
  raw_comments JSONB DEFAULT '[]'::jsonb,

  -- Findings (null until succeeded/partial)
  profile_pic_assessment JSONB,
  bio_assessment JSONB,
  caption_pattern JSONB,
  comment_signal JSONB,
  posting_cadence JSONB,
  observations TEXT[],
  biggest_opportunity TEXT,

  -- Strategist overrides (per-field JSON map)
  overrides JSONB DEFAULT '{}'::jsonb,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_analyses_prospect_created
  ON prospect_analyses(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_analyses_status
  ON prospect_analyses(status) WHERE status IN ('pending','running');
CREATE UNIQUE INDEX IF NOT EXISTS uq_prospect_analyses_run
  ON prospect_analyses(prospect_id, run_id);

DROP TRIGGER IF EXISTS trg_prospect_analyses_updated ON prospect_analyses;
CREATE TRIGGER trg_prospect_analyses_updated
  BEFORE UPDATE ON prospect_analyses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: admin-only (same shape as prospects)
ALTER TABLE prospect_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospect_analyses_admin_all ON prospect_analyses;
CREATE POLICY prospect_analyses_admin_all ON prospect_analyses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
