-- Client-level shareable review links (like Later's calendar share)
CREATE TABLE IF NOT EXISTS client_review_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  label TEXT NOT NULL DEFAULT 'Review link',
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_review_links_token ON client_review_links(token);
CREATE INDEX IF NOT EXISTS idx_client_review_links_client ON client_review_links(client_id);

ALTER TABLE client_review_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage client_review_links"
  ON client_review_links FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anonymous reads by token (for public review page)
CREATE POLICY "Anyone can read active client_review_links by token"
  ON client_review_links FOR SELECT TO anon USING (is_active = true);
