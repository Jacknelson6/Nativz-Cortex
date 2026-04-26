-- 169_scheduling_people.sql — people-with-priority for SA-driven calendar overlay
-- ----------------------------------------------------------------------------
-- Each person has 1+ workspace emails. Jake operates under jake@nativz.io and
-- jake@andersoncollaborative.com; we pull events from each via the SA + DWD
-- pipeline and union by person. Tier 1 (Cole, Trevor) are required for slot
-- generation; Tier 2 (Jack) is nice-to-have; Tier 3 (Jake) can be absent.
--
-- This is the source of truth for the unified calendar overlay (/admin/calendar)
-- and will eventually back the team_scheduling_event_members rows too — for
-- now, the per-event scheduler still uses auth.users directly.

-- ──────────────────────────────────────────────────────────────────────
-- 1. scheduling_people — top-level identity
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scheduling_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  color TEXT NOT NULL,                                -- hex, e.g. '#8b5cf6'
  priority_tier INT NOT NULL CHECK (priority_tier IN (1, 2, 3)),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scheduling_people_active_sort_idx
  ON scheduling_people (sort_order)
  WHERE is_active = TRUE;

-- ──────────────────────────────────────────────────────────────────────
-- 2. scheduling_person_emails — 1:N emails per person
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scheduling_person_emails (
  person_id UUID NOT NULL REFERENCES scheduling_people(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (person_id, email)
);

-- One email maps to at most one person — case-insensitive uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS scheduling_person_emails_unique_lower
  ON scheduling_person_emails (lower(email));

CREATE INDEX IF NOT EXISTS scheduling_person_emails_lower_email_idx
  ON scheduling_person_emails (lower(email));

-- ──────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ──────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS scheduling_people_set_updated_at ON scheduling_people;
CREATE TRIGGER scheduling_people_set_updated_at
  BEFORE UPDATE ON scheduling_people
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- 4. RLS — admin only
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE scheduling_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_person_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduling_people admin all" ON scheduling_people;
CREATE POLICY "scheduling_people admin all"
  ON scheduling_people FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)));

DROP POLICY IF EXISTS "scheduling_person_emails admin all" ON scheduling_person_emails;
CREATE POLICY "scheduling_person_emails admin all"
  ON scheduling_person_emails FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)));

-- ──────────────────────────────────────────────────────────────────────
-- 5. Seed the four known stakeholders
-- ──────────────────────────────────────────────────────────────────────

INSERT INTO scheduling_people (id, display_name, color, priority_tier, sort_order)
VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Cole Feigl',     '#8b5cf6', 1, 0),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Trevor Anderson','#06b6d4', 1, 1),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'Jack Nelson',    '#3b82f6', 2, 2),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'Jacob Pak',      '#f97316', 3, 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO scheduling_person_emails (person_id, email) VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'cole@nativz.io'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'cole@andersoncollaborative.com'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'trevor@andersoncollaborative.com'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'trevor@nativz.io'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'jack@nativz.io'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'jack@andersoncollaborative.com'),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'jake@nativz.io'),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'jake@andersoncollaborative.com')
ON CONFLICT (person_id, email) DO NOTHING;
