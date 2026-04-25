-- 163_onboarding_email_sends_flow.sql — wire the per-flow system-email log
-- ---------------------------------------------------------------------------
-- The onboarding_email_sends audit log was originally per-tracker. The new
-- flow-level system emails (POC invite, reminder, stakeholder milestone,
-- stakeholder no-progress) log at the flow level — they don't necessarily
-- map to any single tracker. Add a nullable flow_id column + index. Both
-- old per-tracker rows and new per-flow rows live in the same audit table.

ALTER TABLE onboarding_email_sends
  ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES onboarding_flows(id) ON DELETE SET NULL;

ALTER TABLE onboarding_email_sends
  ADD COLUMN IF NOT EXISTS kind TEXT;
-- 'poc_invite' | 'poc_reminder' | 'stakeholder_milestone' | 'stakeholder_no_progress'
-- | NULL for legacy admin-fired ad-hoc emails.

CREATE INDEX IF NOT EXISTS onboarding_email_sends_flow_idx
  ON onboarding_email_sends (flow_id, sent_at DESC)
  WHERE flow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS onboarding_email_sends_flow_kind_idx
  ON onboarding_email_sends (flow_id, kind, sent_at DESC)
  WHERE flow_id IS NOT NULL;
