-- 168_team_scheduling_events.sql — cal.diy-style team availability scheduler.
-- ----------------------------------------------------------------------------
-- Lets a Cortex admin spin up a "find a time when all of <team members> are
-- free" event for a client and share a public pick page. Each team member's
-- Google Calendar (via the existing native OAuth in lib/google/auth.ts) is
-- queried for busy windows via freebusy.query; the union of busy across
-- members is subtracted from a working-hours window to produce the slots a
-- client can choose from. The picked slot:
--   - Records on team_scheduling_event_picks
--   - Patches the linked schedule_meeting onboarding item's data jsonb
--     with scheduled_for + status='done'
--
-- Initial scope: one pick per event (single-meeting), client-facing UX is
-- token-gated. Future: round-robin, multi-pick polls, calendar event creation
-- on the team members' calendars after pick.

-- ──────────────────────────────────────────────────────────────────────
-- 1. team_scheduling_events
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_scheduling_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  flow_id UUID REFERENCES onboarding_flows(id) ON DELETE SET NULL,
  -- The onboarding item this event resolves. NULL for ad-hoc scheduling.
  item_id UUID REFERENCES onboarding_checklist_items(id) ON DELETE SET NULL,

  name TEXT NOT NULL,                                -- e.g. "Kickoff with Nike"
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 15 AND 240),
  lookahead_days INTEGER NOT NULL DEFAULT 14 CHECK (lookahead_days BETWEEN 1 AND 60),

  -- Working-hours window applied per day across all members. UTC ISO time
  -- strings stored as text for portability; computed in the local tz of
  -- the event when slots are generated.
  working_start TIME NOT NULL DEFAULT '09:00',
  working_end TIME NOT NULL DEFAULT '17:00',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',

  -- Public client URL is /schedule/<share_token>
  share_token UUID NOT NULL DEFAULT gen_random_uuid(),

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'scheduled', 'canceled', 'expired')),

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_scheduling_events_share_token_idx
  ON team_scheduling_events (share_token);
CREATE INDEX IF NOT EXISTS team_scheduling_events_client_idx
  ON team_scheduling_events (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS team_scheduling_events_flow_idx
  ON team_scheduling_events (flow_id) WHERE flow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS team_scheduling_events_item_idx
  ON team_scheduling_events (item_id) WHERE item_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 2. team_scheduling_event_members — invited team members per event
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_scheduling_event_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES team_scheduling_events(id) ON DELETE CASCADE,
  -- auth.users.id (must have lib/google/auth.ts OAuth connection w/
  -- calendar.readonly scope). Snapshot email + name so the picker UI can
  -- show "Jack + Cole" without re-joining users.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role_label TEXT,                                   -- "Account Mgr", "Lead Editor"

  -- 'required' members must be free for a slot to surface.
  -- 'optional' members are included in the overlap set but absence doesn't
  -- block a slot — surfaced as a "X of Y" available count to the client.
  attendance TEXT NOT NULL DEFAULT 'required'
    CHECK (attendance IN ('required', 'optional')),

  -- Cached freebusy fetch state — updated when slots are recomputed.
  last_freebusy_fetched_at TIMESTAMPTZ,
  last_freebusy_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS team_scheduling_event_members_event_idx
  ON team_scheduling_event_members (event_id);

-- ──────────────────────────────────────────────────────────────────────
-- 3. team_scheduling_event_picks — client's chosen slot
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_scheduling_event_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES team_scheduling_events(id) ON DELETE CASCADE,

  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  picked_by_email TEXT NOT NULL,
  picked_by_name TEXT,
  picked_by_ip TEXT,

  notes TEXT,
  google_event_ids JSONB NOT NULL DEFAULT '{}'::jsonb,  -- per-user-id created Google Calendar event id
  cancelled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS team_scheduling_event_picks_event_idx
  ON team_scheduling_event_picks (event_id);
-- One uncancelled pick per event for now (single-meeting MVP).
CREATE UNIQUE INDEX IF NOT EXISTS team_scheduling_event_picks_one_active
  ON team_scheduling_event_picks (event_id) WHERE cancelled_at IS NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 4. updated_at triggers (reuse the existing helper from migration 136)
-- ──────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS team_scheduling_events_set_updated_at ON team_scheduling_events;
CREATE TRIGGER team_scheduling_events_set_updated_at
  BEFORE UPDATE ON team_scheduling_events
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();

DROP TRIGGER IF EXISTS team_scheduling_event_members_set_updated_at ON team_scheduling_event_members;
CREATE TRIGGER team_scheduling_event_members_set_updated_at
  BEFORE UPDATE ON team_scheduling_event_members
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- 5. RLS — admin-only writes; public reads happen via createAdminClient
--    + share_token validation in the route handler.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE team_scheduling_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_scheduling_event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_scheduling_event_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_scheduling_events admin all" ON team_scheduling_events;
CREATE POLICY "team_scheduling_events admin all"
  ON team_scheduling_events FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)));

DROP POLICY IF EXISTS "team_scheduling_event_members admin all" ON team_scheduling_event_members;
CREATE POLICY "team_scheduling_event_members admin all"
  ON team_scheduling_event_members FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)));

DROP POLICY IF EXISTS "team_scheduling_event_picks admin all" ON team_scheduling_event_picks;
CREATE POLICY "team_scheduling_event_picks admin all"
  ON team_scheduling_event_picks FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)));
