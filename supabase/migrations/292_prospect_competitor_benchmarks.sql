-- ============================================================
-- SPY-05: Prospect competitor head-to-head benchmark
-- One row per benchmark run; competitor analyses stored as JSON.
--
-- Renumbered from PRD's 280 to 292 to fit the SPY-04 follow-on
-- ordering (290 = SPY-03, 291 = SPY-04).
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_competitor_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES prospect_analyses(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','discovering','scraping','grading','succeeded','partial','failed','cancelled')),
  error_message TEXT,
  duration_ms INTEGER,
  cost_cents INTEGER,
  cancelled_at TIMESTAMPTZ,

  -- Inputs: [{ platform, handle, profile_url, display_name, source, rationale }]
  picked_competitors JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Output: [{ handle, platform, status, scorecard, raw_inputs, error? }]
  competitors JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Deltas: { behind: ChecklistItemId[]; ahead: ChecklistItemId[]; tied: ChecklistItemId[] }
  deltas JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_competitor_benchmarks_prospect_created
  ON prospect_competitor_benchmarks(prospect_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_competitor_benchmarks_status
  ON prospect_competitor_benchmarks(status)
  WHERE status IN ('pending','discovering','scraping','grading');

DROP TRIGGER IF EXISTS trg_prospect_competitor_benchmarks_updated
  ON prospect_competitor_benchmarks;
CREATE TRIGGER trg_prospect_competitor_benchmarks_updated
  BEFORE UPDATE ON prospect_competitor_benchmarks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE prospect_competitor_benchmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcb_admin_all ON prospect_competitor_benchmarks;
CREATE POLICY pcb_admin_all ON prospect_competitor_benchmarks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
