-- 143_onboarding_events.sql — audit + feed for client-side onboarding actions
-- ----------------------------------------------------------------------------
-- Every action fired from the public /onboarding/[slug] page (client ticking
-- own checklist items, uploading assets, confirming access handoffs) writes a
-- row here. Two uses:
--   1. Admin audit trail — prove what the client clicked and when
--   2. Feed for notification fan-out — admins subscribe to these events by
--      kind and receive Resend emails + in-app alerts
--
-- Tracker FK is ON DELETE CASCADE because events are noise without the
-- tracker. Event kinds are an enum-like text check to make sure we don't
-- accidentally log mismatched types.

CREATE TABLE IF NOT EXISTS onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id UUID NOT NULL REFERENCES onboarding_trackers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'item_completed',
    'item_uncompleted',
    'file_uploaded',
    'file_deleted',
    'connection_confirmed',
    'phase_viewed'
  )),
  -- Polymorphic pointer to the subject of the event. item_id for checklist
  -- actions, phase_id for phase-level, NULL for tracker-level events.
  item_id UUID REFERENCES onboarding_checklist_items(id) ON DELETE SET NULL,
  phase_id UUID REFERENCES onboarding_phases(id) ON DELETE SET NULL,
  -- Arbitrary payload (task name snapshot, file path, platform, etc.) so the
  -- feed renders a useful one-liner even if the underlying row is deleted.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Actor. Client actions on the public page are 'client'; admin edits that
  -- we want to surface too can log as 'admin'. Never an auth.users FK because
  -- clients have no user account.
  actor TEXT NOT NULL DEFAULT 'client' CHECK (actor IN ('client', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_events_tracker_idx
  ON onboarding_events (tracker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS onboarding_events_kind_idx
  ON onboarding_events (kind, created_at DESC);

ALTER TABLE onboarding_events ENABLE ROW LEVEL SECURITY;

-- Admin-only read/write. Public clients write via the API route using the
-- service-role admin client after share_token validation; they never touch
-- this table with RLS in play.
DROP POLICY IF EXISTS "onboarding_events admin all" ON onboarding_events;
CREATE POLICY "onboarding_events admin all"
  ON onboarding_events FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));
