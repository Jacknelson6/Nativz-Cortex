-- 136_onboarding_trackers.sql — Per-service onboarding checklists + timeline
-- ----------------------------------------------------------------------------
-- Slice 1 of the onboarding tracker feature. Each (client, service) pair
-- gets its own tracker with phases (timeline) + checklist groups + items.
-- Admins manage everything at /admin/onboarding; clients view a read-only
-- public page via a share_token URL — no portal sign-in needed.
--
-- Scope for this migration:
--   - onboarding_trackers        (one per client+service, owns share_token)
--   - onboarding_phases          (timeline items with status + CTA array)
--   - onboarding_checklist_groups(sections like "Analytics & Search")
--   - onboarding_checklist_items (tasks with owner + status)
--
-- Templates, email template generation, and per-service seeding come in
-- slice 2 / 3.

CREATE TABLE IF NOT EXISTS onboarding_trackers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  share_token UUID NOT NULL DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, service)
);

CREATE INDEX IF NOT EXISTS onboarding_trackers_client_id_idx
  ON onboarding_trackers (client_id);
CREATE INDEX IF NOT EXISTS onboarding_trackers_share_token_idx
  ON onboarding_trackers (share_token);

CREATE TABLE IF NOT EXISTS onboarding_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id UUID NOT NULL REFERENCES onboarding_trackers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  what_we_need TEXT,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'done')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- Array of CTA buttons: [{ label, url, variant: 'primary' | 'secondary' }]
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  progress_percent INTEGER CHECK (progress_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_phases_tracker_idx
  ON onboarding_phases (tracker_id, sort_order);

CREATE TABLE IF NOT EXISTS onboarding_checklist_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id UUID NOT NULL REFERENCES onboarding_trackers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_groups_tracker_idx
  ON onboarding_checklist_groups (tracker_id, sort_order);

CREATE TABLE IF NOT EXISTS onboarding_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES onboarding_checklist_groups(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  description TEXT,
  owner TEXT NOT NULL DEFAULT 'agency' CHECK (owner IN ('agency', 'client')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_items_group_idx
  ON onboarding_checklist_items (group_id, sort_order);

ALTER TABLE onboarding_trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_checklist_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_trackers admin all" ON onboarding_trackers;
CREATE POLICY "onboarding_trackers admin all"
  ON onboarding_trackers FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

DROP POLICY IF EXISTS "onboarding_phases admin all" ON onboarding_phases;
CREATE POLICY "onboarding_phases admin all"
  ON onboarding_phases FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

DROP POLICY IF EXISTS "onboarding_checklist_groups admin all" ON onboarding_checklist_groups;
CREATE POLICY "onboarding_checklist_groups admin all"
  ON onboarding_checklist_groups FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

DROP POLICY IF EXISTS "onboarding_checklist_items admin all" ON onboarding_checklist_items;
CREATE POLICY "onboarding_checklist_items admin all"
  ON onboarding_checklist_items FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE OR REPLACE FUNCTION set_onboarding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS onboarding_trackers_set_updated_at ON onboarding_trackers;
CREATE TRIGGER onboarding_trackers_set_updated_at
  BEFORE UPDATE ON onboarding_trackers
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();

DROP TRIGGER IF EXISTS onboarding_phases_set_updated_at ON onboarding_phases;
CREATE TRIGGER onboarding_phases_set_updated_at
  BEFORE UPDATE ON onboarding_phases
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();

DROP TRIGGER IF EXISTS onboarding_groups_set_updated_at ON onboarding_checklist_groups;
CREATE TRIGGER onboarding_groups_set_updated_at
  BEFORE UPDATE ON onboarding_checklist_groups
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();

DROP TRIGGER IF EXISTS onboarding_items_set_updated_at ON onboarding_checklist_items;
CREATE TRIGGER onboarding_items_set_updated_at
  BEFORE UPDATE ON onboarding_checklist_items
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();
