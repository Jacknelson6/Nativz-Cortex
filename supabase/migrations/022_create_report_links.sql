-- Shareable report links (mirrors search_share_links pattern)
CREATE TABLE IF NOT EXISTS report_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  sections JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_links_token ON report_links(token);
CREATE INDEX IF NOT EXISTS idx_report_links_client ON report_links(client_id);

ALTER TABLE report_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage report_links"
  ON report_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
