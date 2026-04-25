-- 162_onboarding_flows.sql — Flow container around per-service trackers.
-- ----------------------------------------------------------------------------
-- The legacy model was one tracker per (client, service). The new model wraps
-- N trackers under a single onboarding_flow per client. The flow owns:
--   - status (needs_proposal → awaiting_payment → active → completed)
--   - the proposal that gates the public POC link
--   - POC emails (recipients of the share-link invite + reminders)
--   - milestone stakeholders (internal admins notified on key events)
--   - the share_token (one URL for the whole flow, not per-segment)
--
-- Onboarding flow always begins with the implicit "Agreement & Payment"
-- segment, which observes proposals.{sent,signed,paid} via webhooks. Once
-- proposals.status = 'paid', the flow advances to `active` and the POC
-- invite email fires.
--
-- The dead email-templates editor + its tables get cleaned up in 163.

-- ──────────────────────────────────────────────────────────────────────
-- 1. onboarding_flows
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS onboarding_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'needs_proposal'
    CHECK (status IN (
      'needs_proposal',     -- created on lifecycle flip; admin must attach a proposal
      'awaiting_payment',   -- proposal sent/signed but not paid; POC link still gated
      'active',             -- proposal paid; POC invite sent; segments in flight
      'paused',             -- admin paused (no reminders fire)
      'completed',          -- every segment + every checklist done
      'archived'            -- soft-deleted
    )),
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  share_token UUID NOT NULL DEFAULT gen_random_uuid(),

  -- POC recipients of the share-link invite + 48h reminders.
  -- Multi-recipient by design (some clients have a marketing director +
  -- ops manager who both want eyes on it).
  poc_emails TEXT[] NOT NULL DEFAULT '{}',

  -- Set when the lifecycle flip created this row. Lets us show a
  -- persistent "Start onboarding" toast on the next admin page load.
  toast_dismissed_at TIMESTAMPTZ,

  -- Cached cursors for cron logic. Updated by triggers / app code.
  last_poc_activity_at TIMESTAMPTZ,        -- last share-view or POC tick
  last_reminder_sent_at TIMESTAMPTZ,       -- last 48h cadence email
  last_no_progress_flag_at TIMESTAMPTZ,    -- last 5-day stakeholder ping

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,                   -- admin can close a flow without finishing every task
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One live (non-archived, non-completed) flow per client. Re-onboarding
-- spawns a new flow only after the previous is archived or completed.
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_flows_one_live_per_client
  ON onboarding_flows (client_id)
  WHERE status NOT IN ('archived', 'completed');

CREATE INDEX IF NOT EXISTS onboarding_flows_client_idx ON onboarding_flows (client_id);
CREATE INDEX IF NOT EXISTS onboarding_flows_status_idx ON onboarding_flows (status);
CREATE INDEX IF NOT EXISTS onboarding_flows_share_token_idx ON onboarding_flows (share_token);
CREATE INDEX IF NOT EXISTS onboarding_flows_proposal_idx ON onboarding_flows (proposal_id);
CREATE INDEX IF NOT EXISTS onboarding_flows_active_cron_idx
  ON onboarding_flows (status, last_reminder_sent_at)
  WHERE status = 'active';

-- ──────────────────────────────────────────────────────────────────────
-- 2. onboarding_flow_segments — joins flows to per-service trackers.
-- ──────────────────────────────────────────────────────────────────────
-- Each segment links a flow to ONE existing onboarding_trackers row.
-- The first segment ("agreement_payment") is virtual — it has no tracker
-- because its checklist is computed from proposal events. Real segments
-- (social, paid_media, web, etc.) have a tracker_id.

CREATE TABLE IF NOT EXISTS onboarding_flow_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES onboarding_flows(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                    -- 'agreement_payment' | 'social' | 'paid_media' | 'web' | …
  tracker_id UUID REFERENCES onboarding_trackers(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each kind appears at most once per flow (you can't have two Social
  -- segments in the same onboarding).
  CONSTRAINT onboarding_flow_segments_unique_kind UNIQUE (flow_id, kind)
);

CREATE INDEX IF NOT EXISTS onboarding_flow_segments_flow_idx
  ON onboarding_flow_segments (flow_id, position);
CREATE INDEX IF NOT EXISTS onboarding_flow_segments_tracker_idx
  ON onboarding_flow_segments (tracker_id) WHERE tracker_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 3. onboarding_flow_stakeholders — internal admins notified on milestones.
-- ──────────────────────────────────────────────────────────────────────
-- One row per (flow, admin user). Each row encodes which milestone types
-- the stakeholder wants to be notified about. The picker UI shows the
-- admin's role (CEO/CFO/etc. — denormalized into role_label so we don't
-- need to join users on every render).

CREATE TABLE IF NOT EXISTS onboarding_flow_stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES onboarding_flows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,                  -- snapshot at attach time (auth.users.email can rotate)
  display_name TEXT,                    -- snapshot
  role_label TEXT,                      -- snapshot of users.role_title or similar (CEO/CFO/Account Mgr)

  notify_on_invoice_paid BOOLEAN NOT NULL DEFAULT FALSE,
  notify_on_segment_completed BOOLEAN NOT NULL DEFAULT FALSE,
  notify_on_onboarding_complete BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (flow_id, user_id)
);

CREATE INDEX IF NOT EXISTS onboarding_flow_stakeholders_flow_idx
  ON onboarding_flow_stakeholders (flow_id);

-- ──────────────────────────────────────────────────────────────────────
-- 4. updated_at triggers (reuse the existing helper).
-- ──────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS onboarding_flows_set_updated_at ON onboarding_flows;
CREATE TRIGGER onboarding_flows_set_updated_at
  BEFORE UPDATE ON onboarding_flows
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();

DROP TRIGGER IF EXISTS onboarding_flow_segments_set_updated_at ON onboarding_flow_segments;
CREATE TRIGGER onboarding_flow_segments_set_updated_at
  BEFORE UPDATE ON onboarding_flow_segments
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();

DROP TRIGGER IF EXISTS onboarding_flow_stakeholders_set_updated_at ON onboarding_flow_stakeholders;
CREATE TRIGGER onboarding_flow_stakeholders_set_updated_at
  BEFORE UPDATE ON onboarding_flow_stakeholders
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- 5. RLS — admin-only (viewers don't see flows in Cortex; the public POC
--    surface uses share_token via createAdminClient + token validation).
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE onboarding_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_flow_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_flow_stakeholders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_flows admin all" ON onboarding_flows;
CREATE POLICY "onboarding_flows admin all"
  ON onboarding_flows FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)));

DROP POLICY IF EXISTS "onboarding_flow_segments admin all" ON onboarding_flow_segments;
CREATE POLICY "onboarding_flow_segments admin all"
  ON onboarding_flow_segments FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)));

DROP POLICY IF EXISTS "onboarding_flow_stakeholders admin all" ON onboarding_flow_stakeholders;
CREATE POLICY "onboarding_flow_stakeholders admin all"
  ON onboarding_flow_stakeholders FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)));

-- ──────────────────────────────────────────────────────────────────────
-- 6. flow_id back-ref on proposals so the proposals admin tool can show
--    "this proposal is attached to flow X" and the on-paid handler can
--    find the flow without a status table scan.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS onboarding_flow_id UUID REFERENCES onboarding_flows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS proposals_onboarding_flow_idx
  ON proposals (onboarding_flow_id) WHERE onboarding_flow_id IS NOT NULL;
