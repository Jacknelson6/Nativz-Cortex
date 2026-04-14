-- ─────────────────────────────────────────────────────────────────────────
-- Migration 102 — Phase 1 of competitor benchmarking
--
-- Attaches a finished Analyze Social audit to a specific client so it can
-- seed a recurring competitor-tracking workflow. Phase 2 (competitor_snapshots)
-- and Phase 3 (analytics view) build on this row.
--
-- Snapshot-on-attach: we freeze a copy of the audit's competitor list into
-- `competitors_snapshot` so subsequent edits to the audit don't mutate the
-- benchmark baseline. The list is what Phase 2's cron iterates over.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  audit_id UUID NOT NULL REFERENCES prospect_audits(id) ON DELETE CASCADE,

  -- Frozen list of competitor profiles at attach time. Shape matches
  -- lib/audit/types.ts#CompetitorProfile (username, platform, displayName,
  -- followers, profileUrl, avatarUrl). Phase 2 snapshots key off these.
  competitors_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,

  cadence TEXT NOT NULL DEFAULT 'weekly'
    CHECK (cadence IN ('weekly','biweekly','monthly')),

  -- 'auto' prefers the client's own analytics when they exist, falls back
  -- to scraping. 'scrape' forces scraping even when analytics exist.
  -- 'client_analytics' refuses to scrape (for clients who don't want the
  -- extra Apify cost).
  analytics_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (analytics_source IN ('auto','scrape','client_analytics')),

  date_range_start DATE,
  date_range_end DATE,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,

  last_snapshot_at TIMESTAMPTZ,
  next_snapshot_due_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_benchmarks_client
  ON client_benchmarks(client_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_client_benchmarks_due
  ON client_benchmarks(next_snapshot_due_at)
  WHERE is_active = TRUE;

-- ── updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION client_benchmarks_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_benchmarks_updated_at ON client_benchmarks;
CREATE TRIGGER trg_client_benchmarks_updated_at
  BEFORE UPDATE ON client_benchmarks
  FOR EACH ROW EXECUTE FUNCTION client_benchmarks_touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE client_benchmarks ENABLE ROW LEVEL SECURITY;

-- Admins have full read/write (service role bypasses RLS anyway).
DROP POLICY IF EXISTS client_benchmarks_admin_all ON client_benchmarks;
CREATE POLICY client_benchmarks_admin_all ON client_benchmarks
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

-- Portal viewers can READ benchmarks for clients they have access to; write
-- is admin-only per product requirements ("admins set benchmarks, not the
-- clients").
DROP POLICY IF EXISTS client_benchmarks_viewer_read ON client_benchmarks;
CREATE POLICY client_benchmarks_viewer_read ON client_benchmarks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM user_client_access uca
      WHERE uca.user_id = auth.uid()
        AND uca.client_id = client_benchmarks.client_id
    )
  );

COMMENT ON TABLE client_benchmarks IS
  'Attaches a finished analyze-social audit to a client for recurring competitor tracking. Phase 1 of benchmarking.';
