CREATE TABLE IF NOT EXISTS agency_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency TEXT NOT NULL UNIQUE,
  scheduling_link TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO agency_settings (agency) VALUES ('nativz'), ('ac') ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE agency_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read agency_settings" ON agency_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Admin update agency_settings" ON agency_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );
