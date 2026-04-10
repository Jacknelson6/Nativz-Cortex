-- Audit share links (mirrors search_share_links pattern)
CREATE TABLE IF NOT EXISTS audit_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES prospect_audits(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on audit_share_links"
  ON audit_share_links FOR ALL USING (true);

CREATE INDEX idx_audit_share_links_token ON audit_share_links(token);
CREATE INDEX idx_audit_share_links_audit ON audit_share_links(audit_id);
