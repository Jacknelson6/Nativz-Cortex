-- 139_onboarding_email_sends.sql — audit log for in-app onboarding email sends.
-- ----------------------------------------------------------------------------
-- Captures every ad-hoc "Send email" fired from /admin/onboarding/[id]. Keeps
-- subject + body snapshots so the admin can prove what was sent, even if the
-- template has been edited since. Tracker + template FKs go to SET NULL on
-- delete so the audit row survives deletions (important for customer service
-- later).

CREATE TABLE IF NOT EXISTS onboarding_email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id UUID REFERENCES onboarding_trackers(id) ON DELETE SET NULL,
  template_id UUID REFERENCES onboarding_email_templates(id) ON DELETE SET NULL,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  resend_id TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_email_sends_tracker_idx
  ON onboarding_email_sends (tracker_id, sent_at DESC);

ALTER TABLE onboarding_email_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_email_sends admin all" ON onboarding_email_sends;
CREATE POLICY "onboarding_email_sends admin all"
  ON onboarding_email_sends FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));
