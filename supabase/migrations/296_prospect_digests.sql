-- ============================================================
-- SPY-10: Prospect digest subscriptions + drafts + events
-- (PRD called this 283; bumped to 296 since 295 is the latest applied.)
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_digest_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('weekly_competitor','monthly_format')),
  active BOOLEAN NOT NULL DEFAULT true,
  start_date DATE NOT NULL,
  last_built_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  unsubscribed_via TEXT CHECK (unsubscribed_via IN ('per_type','all_stop')),
  unsubscribe_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(prospect_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_pds_active
  ON prospect_digest_subscriptions(active, kind) WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_pds_prospect
  ON prospect_digest_subscriptions(prospect_id);

CREATE TABLE IF NOT EXISTS prospect_digest_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES prospect_digest_subscriptions(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('weekly_competitor','monthly_format')),
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  to_email TEXT NOT NULL,
  reply_to_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted'
    CHECK (status IN ('drafted','approved','sent','expired','rejected')),
  resend_message_id TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pdd_status
  ON prospect_digest_drafts(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_pdd_prospect
  ON prospect_digest_drafts(prospect_id);

CREATE TABLE IF NOT EXISTS prospect_digest_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES prospect_digest_drafts(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sent','opened','clicked','unsubscribed','bounced','complained')),
  target_url TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pde_draft ON prospect_digest_events(draft_id);
CREATE INDEX IF NOT EXISTS idx_pde_kind_time ON prospect_digest_events(kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pde_prospect ON prospect_digest_events(prospect_id);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_pds_updated_at ON prospect_digest_subscriptions;
CREATE TRIGGER trg_pds_updated_at
  BEFORE UPDATE ON prospect_digest_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pdd_updated_at ON prospect_digest_drafts;
CREATE TRIGGER trg_pdd_updated_at
  BEFORE UPDATE ON prospect_digest_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: admin-only on the 3 tables.
ALTER TABLE prospect_digest_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_digest_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_digest_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_pds ON prospect_digest_subscriptions;
CREATE POLICY admin_all_pds ON prospect_digest_subscriptions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS admin_all_pdd ON prospect_digest_drafts;
CREATE POLICY admin_all_pdd ON prospect_digest_drafts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS admin_all_pde ON prospect_digest_events;
CREATE POLICY admin_all_pde ON prospect_digest_events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
