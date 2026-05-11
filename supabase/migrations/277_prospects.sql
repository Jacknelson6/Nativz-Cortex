-- ============================================================
-- SPY-01: Prospect pipeline scaffolding
-- Tables: prospects, prospect_socials, prospect_touchpoints
-- ============================================================

CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  website_url TEXT,
  primary_platform TEXT CHECK (primary_platform IN ('tiktok','instagram','youtube','facebook')),
  primary_handle TEXT,
  niche TEXT,
  notes TEXT,
  lifecycle_state TEXT NOT NULL DEFAULT 'discovered'
    CHECK (lifecycle_state IN ('discovered','audited','in_outreach','demo_scheduled','converted','lost')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','from_brand_audit','from_prospect_audit','imported')),
  source_ref_id UUID,
  owner_user_id UUID REFERENCES auth.users(id),
  archived_at TIMESTAMPTZ,
  last_touched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospects_state ON prospects(lifecycle_state) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_last_touched ON prospects(last_touched_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_owner ON prospects(owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prospects_source_ref ON prospects(source, source_ref_id) WHERE source_ref_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS prospect_socials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','youtube','facebook')),
  handle TEXT NOT NULL,
  profile_url TEXT,
  display_name TEXT,
  avatar_url TEXT,
  followers_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prospect_socials_prospect_platform ON prospect_socials(prospect_id, platform);

CREATE TABLE IF NOT EXISTS prospect_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('note','email_sent','email_received','meeting','demo','loom','dm','phone','state_change')),
  body TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospect_touchpoints_prospect_time ON prospect_touchpoints(prospect_id, occurred_at DESC);

DROP TRIGGER IF EXISTS trg_prospects_updated ON prospects;
CREATE TRIGGER trg_prospects_updated BEFORE UPDATE ON prospects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION bump_prospect_last_touched() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE prospects SET last_touched_at = NEW.occurred_at WHERE id = NEW.prospect_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prospect_touchpoints_bump ON prospect_touchpoints;
CREATE TRIGGER trg_prospect_touchpoints_bump AFTER INSERT ON prospect_touchpoints FOR EACH ROW EXECUTE FUNCTION bump_prospect_last_touched();

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_socials ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_touchpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospects_admin_all ON prospects;
CREATE POLICY prospects_admin_all ON prospects FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
DROP POLICY IF EXISTS prospect_socials_admin_all ON prospect_socials;
CREATE POLICY prospect_socials_admin_all ON prospect_socials FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
DROP POLICY IF EXISTS prospect_touchpoints_admin_all ON prospect_touchpoints;
CREATE POLICY prospect_touchpoints_admin_all ON prospect_touchpoints FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
