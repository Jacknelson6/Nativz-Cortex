-- ============================================================
-- ZNA-06: Per-post metric timepoints + trajectory cache.
-- Sampled every 30 min by app/api/cron/post-timepoints.
-- Retention: 30 days on timepoints; cache updates idempotently.
-- ============================================================

CREATE TABLE IF NOT EXISTS post_metric_timepoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_metric_id UUID NOT NULL REFERENCES post_metrics(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','facebook','youtube')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  age_hours INTEGER NOT NULL,
  views_count INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  saves_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('zernio','scrape','apify')),
  CONSTRAINT post_metric_timepoints_unique_per_capture UNIQUE (post_metric_id, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_post_metric_timepoints_post_time
  ON post_metric_timepoints(post_metric_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_metric_timepoints_retention
  ON post_metric_timepoints(captured_at);

ALTER TABLE post_metric_timepoints ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY post_metric_timepoints_admin_all ON post_metric_timepoints
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
  CREATE POLICY post_metric_timepoints_viewer_read ON post_metric_timepoints
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'viewer'
        AND users.organization_id = post_metric_timepoints.organization_id
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trajectory cache: one row per post.
CREATE TABLE IF NOT EXISTS post_metric_trajectories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_metric_id UUID NOT NULL REFERENCES post_metrics(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('still_climbing','peaked','declining','dead','too_fresh')),
  r24 NUMERIC(8,3),
  r72 NUMERIC(8,3),
  age_hours INTEGER NOT NULL,
  sparkline_views INTEGER[] NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT post_metric_trajectories_unique UNIQUE (post_metric_id)
);

CREATE INDEX IF NOT EXISTS idx_post_metric_trajectories_status
  ON post_metric_trajectories(client_id, status);

ALTER TABLE post_metric_trajectories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY post_metric_trajectories_admin_all ON post_metric_trajectories
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
  CREATE POLICY post_metric_trajectories_viewer_read ON post_metric_trajectories
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'viewer'
        AND users.organization_id = post_metric_trajectories.organization_id
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Retention helper, called at end of each cron run.
CREATE OR REPLACE FUNCTION delete_expired_post_timepoints()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM post_metric_timepoints
   WHERE captured_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
