-- Client knowledge entries: brand assets, documents, notes, web pages, etc.
CREATE TABLE IF NOT EXISTS client_knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('brand_asset', 'brand_profile', 'document', 'web_page', 'note', 'idea')),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  metadata jsonb DEFAULT '{}',
  source text NOT NULL CHECK (source IN ('manual', 'scraped', 'generated', 'imported')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Knowledge links: relate entries to other entities (contacts, searches, strategies, etc.)
CREATE TABLE IF NOT EXISTS client_knowledge_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('entry', 'contact', 'search', 'strategy', 'idea_submission')),
  target_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('entry', 'contact', 'search', 'strategy', 'idea_submission')),
  label text NOT NULL DEFAULT 'related_to',
  created_at timestamptz DEFAULT now(),
  UNIQUE(source_id, source_type, target_id, target_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_client ON client_knowledge_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_type ON client_knowledge_entries(client_id, type);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_client ON client_knowledge_links(client_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_source ON client_knowledge_links(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_target ON client_knowledge_links(target_id, target_type);

-- Enable RLS
ALTER TABLE client_knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_knowledge_links ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access client_knowledge_entries" ON client_knowledge_entries
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admin full access client_knowledge_links" ON client_knowledge_links
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Portal read-only: viewers can see entries for their organization's clients
CREATE POLICY "Viewer read client_knowledge_entries" ON client_knowledge_entries
  FOR SELECT USING (client_id IN (
    SELECT id FROM clients WHERE organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
  ));

CREATE POLICY "Viewer read client_knowledge_links" ON client_knowledge_links
  FOR SELECT USING (client_id IN (
    SELECT id FROM clients WHERE organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
  ));
