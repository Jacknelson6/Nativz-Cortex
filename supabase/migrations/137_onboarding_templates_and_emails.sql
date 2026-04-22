-- 137_onboarding_templates_and_emails.sql — Slice 2 of onboarding tracker
-- ----------------------------------------------------------------------------
-- Service templates + email templates. Service templates reuse the existing
-- onboarding_trackers table (is_template flag + nullable client_id +
-- template_name) so the admin editor works identically for both. Email
-- templates are a separate concern — per-service subject/body pairs with
-- {{placeholder}} variables the editor interpolates against the current
-- tracker.
--
-- Variables supported in email templates (slice 2):
--   {{client_name}}            — tracker.clients.name
--   {{contact_first_name}}     — primary contact's first name (fallback: "there")
--   {{service}}                — tracker.service
--   {{share_url}}              — /onboarding/[slug]?token=...

-- 1. Templates support on onboarding_trackers ---------------------------
ALTER TABLE onboarding_trackers
  ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE onboarding_trackers
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE onboarding_trackers
  ADD COLUMN IF NOT EXISTS template_name TEXT;

-- Postgres treats NULL as distinct in unique indexes, so multiple
-- templates per service (client_id IS NULL) don't collide with each
-- other or with real trackers.
CREATE INDEX IF NOT EXISTS onboarding_trackers_is_template_idx
  ON onboarding_trackers (is_template);

-- 2. Email templates ----------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_email_templates_service_idx
  ON onboarding_email_templates (service, sort_order);

ALTER TABLE onboarding_email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_email_templates admin all" ON onboarding_email_templates;
CREATE POLICY "onboarding_email_templates admin all"
  ON onboarding_email_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

DROP TRIGGER IF EXISTS onboarding_email_templates_set_updated_at ON onboarding_email_templates;
CREATE TRIGGER onboarding_email_templates_set_updated_at
  BEFORE UPDATE ON onboarding_email_templates
  FOR EACH ROW EXECUTE FUNCTION set_onboarding_updated_at();
