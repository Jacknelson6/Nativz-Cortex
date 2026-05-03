-- Migration 227: onboarding v2 schema
--
-- WHY
-- The legacy proposal + onboarding stack (migrations 136 to 165) is being
-- retired. It modelled the work as a graph of trackers, phases, checklist
-- groups, items, flow segments, and stakeholders, which made every UI
-- query a 4-way join and made step state impossible to type. The new
-- system collapses everything into a single `onboardings` row per client
-- with a JSONB `step_state` column that the per-screen UI reads and
-- writes verbatim. The screens themselves know what shape they expect;
-- the database just persists the bag.
--
-- Two onboarding kinds are supported:
--   smm: 7-screen flow (welcome, brand basics, social connect,
--        content prefs, audience + tone, kickoff scheduling, done).
--   editing: 5-screen flow (welcome, project intake, asset drop link,
--        turnaround expectations, done).
--
-- The flow kind is locked at create time; switching kinds creates a new
-- row. Multi-POC clients (e.g. SMM team handing off to a creative POC)
-- share the same onboarding row and the same share_token; the step_state
-- JSONB carries who answered what so we can merge cleanly.
--
-- This migration only ADDS new schema. The legacy onboarding_* and
-- proposal_* tables stay until Phase 4 wiring lands and the last caller
-- is removed; a follow-up migration drops them.
--
-- Sibling additions:
--   - client_team_assignments: which Nativz team members own which roles
--     for which client. Replaces the ad-hoc "POC = first contact"
--     pattern the legacy onboarding flow used.
--   - onboarding_emails_log: every email the onboarding system sends,
--     keyed by onboarding_id so the admin tracker can show "last nudge
--     sent X days ago" without joining email_messages.

-- 1. onboardings ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.onboardings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('smm', 'editing')),
  platforms text[] NOT NULL DEFAULT '{}',
  current_step int NOT NULL DEFAULT 0,
  share_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  step_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'paused', 'abandoned')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboardings_client_id_idx
  ON public.onboardings(client_id);
CREATE INDEX IF NOT EXISTS onboardings_status_idx
  ON public.onboardings(status);
CREATE INDEX IF NOT EXISTS onboardings_share_token_idx
  ON public.onboardings(share_token);

-- One in-flight onboarding per (client, kind). Completed/abandoned rows
-- are excluded from uniqueness so a client can re-run the flow if needed
-- (e.g. switching agency tier later).
CREATE UNIQUE INDEX IF NOT EXISTS onboardings_active_per_kind_unique
  ON public.onboardings(client_id, kind)
  WHERE status IN ('in_progress', 'paused');

COMMENT ON TABLE public.onboardings IS
  'Single-row-per-client onboarding tracker. step_state JSONB is the per-screen scratchpad; current_step is the index into the kind-specific screen list (7 for smm, 5 for editing). share_token gates the public stepper at /onboarding/[token].';
COMMENT ON COLUMN public.onboardings.step_state IS
  'Bag of per-step answers. Shape depends on kind. SMM keys: brand_basics, social_handles, content_prefs, audience_tone, kickoff_pick. Editing keys: project_brief, asset_link, turnaround_ack. Stepper UI owns the shape; DB just persists.';
COMMENT ON COLUMN public.onboardings.platforms IS
  'For SMM: which social platforms the client is signing up to post on (e.g. {tiktok,instagram,youtube}). Drives which connect prompts the stepper shows. Empty for editing.';

-- 2. client_team_assignments --------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN (
    'account_manager',
    'strategist',
    'smm',
    'editor',
    'videographer',
    'poc'
  )),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, team_member_id, role)
);

CREATE INDEX IF NOT EXISTS client_team_assignments_client_id_idx
  ON public.client_team_assignments(client_id);
CREATE INDEX IF NOT EXISTS client_team_assignments_team_member_id_idx
  ON public.client_team_assignments(team_member_id);

-- Only one primary per (client, role). Lets the admin UI mark a single
-- "lead" account manager / lead editor / etc. without breaking when the
-- same person holds multiple roles on different clients.
CREATE UNIQUE INDEX IF NOT EXISTS client_team_assignments_primary_per_role_unique
  ON public.client_team_assignments(client_id, role)
  WHERE is_primary = true;

COMMENT ON TABLE public.client_team_assignments IS
  'Which Nativz team members own which roles for which client. Used by the onboarding tracker to route nudges (lagging step on SMM client → ping the assigned account_manager) and by the brand pages to show the "team on this brand" badge.';

-- 3. onboarding_emails_log ----------------------------------------------

CREATE TABLE IF NOT EXISTS public.onboarding_emails_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.onboardings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'welcome',
    'step_reminder',
    'lagging_nudge',
    'complete',
    'manual',
    'team_assigned'
  )),
  to_email text NOT NULL,
  subject text NOT NULL,
  body_preview text,
  resend_id text,
  ok boolean NOT NULL DEFAULT true,
  error text,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_emails_log_onboarding_id_sent_at_idx
  ON public.onboarding_emails_log(onboarding_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS onboarding_emails_log_kind_idx
  ON public.onboarding_emails_log(kind);

COMMENT ON TABLE public.onboarding_emails_log IS
  'Every email the onboarding system sends. The admin tracker reads this to show "last nudge X days ago" and suppress duplicate auto-nudges. triggered_by is null for cron-driven sends.';

-- 4. updated_at trigger for onboardings ---------------------------------

CREATE OR REPLACE FUNCTION public.onboardings_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS onboardings_set_updated_at ON public.onboardings;
CREATE TRIGGER onboardings_set_updated_at
  BEFORE UPDATE ON public.onboardings
  FOR EACH ROW
  EXECUTE FUNCTION public.onboardings_set_updated_at();

-- 5. RLS ----------------------------------------------------------------

ALTER TABLE public.onboardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_team_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_emails_log ENABLE ROW LEVEL SECURITY;

-- Admin: full access on all three.
DROP POLICY IF EXISTS onboardings_admin ON public.onboardings;
CREATE POLICY onboardings_admin ON public.onboardings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS client_team_assignments_admin ON public.client_team_assignments;
CREATE POLICY client_team_assignments_admin ON public.client_team_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS onboarding_emails_log_admin ON public.onboarding_emails_log;
CREATE POLICY onboarding_emails_log_admin ON public.onboarding_emails_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- The public stepper at /onboarding/[token] is share-token-gated and
-- talks through a server route that uses createAdminClient(), so no
-- viewer-side RLS policy is required. The token IS the auth.

-- 6. Grants -------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboardings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_team_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_emails_log TO authenticated;
