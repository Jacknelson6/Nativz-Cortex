-- ============================================================
-- SPY-04: Prospect scorecard share links + view analytics
-- Mirrors audit_share_links pattern.
-- Renumbered from PRD's 279 (taken) → 291.
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES prospect_analyses(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  pdf_storage_path TEXT,
  scorecard_snapshot JSONB NOT NULL,
  name TEXT,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '90 days'),
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospect_share_links_prospect ON prospect_share_links(prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_share_links_token ON prospect_share_links(token);
CREATE INDEX IF NOT EXISTS idx_prospect_share_links_active
  ON prospect_share_links(prospect_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS prospect_share_link_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES prospect_share_links(id) ON DELETE CASCADE,
  viewer_ip_hash TEXT,
  viewer_ua TEXT,
  referrer TEXT,
  duration_ms INTEGER,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospect_share_link_views_link_time
  ON prospect_share_link_views(share_link_id, viewed_at DESC);

ALTER TABLE prospect_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_share_link_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospect_share_links_admin_all ON prospect_share_links;
CREATE POLICY prospect_share_links_admin_all ON prospect_share_links
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS prospect_share_link_views_admin_all ON prospect_share_link_views;
CREATE POLICY prospect_share_link_views_admin_all ON prospect_share_link_views
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
