-- Calendar connections for Google Calendar OAuth via Nango.
-- Supports both team member connections (user_id) and client contact
-- connections (contact_id). The invite_token column enables a public
-- connect page where a contact can complete OAuth without a Supabase
-- session.

CREATE TABLE IF NOT EXISTS calendar_connections (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id           uuid        REFERENCES contacts(id)   ON DELETE CASCADE,
  nango_connection_id  text        NOT NULL,
  connection_type      text        NOT NULL DEFAULT 'team'
                                   CHECK (connection_type IN ('team', 'client')),
  invite_token         text        UNIQUE,
  display_name         text,
  display_color        text,
  expires_at           timestamptz,
  is_active            bool        NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup by invite_token (used on the public connect page)
CREATE INDEX IF NOT EXISTS idx_calendar_connections_invite_token
  ON calendar_connections (invite_token)
  WHERE invite_token IS NOT NULL;

-- Useful secondary indexes
CREATE INDEX IF NOT EXISTS idx_calendar_connections_user_id
  ON calendar_connections (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_connections_contact_id
  ON calendar_connections (contact_id)
  WHERE contact_id IS NOT NULL;

-- Row-level security
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all connections (needed to render the
-- calendar overlay for any team member or client contact).
CREATE POLICY "Authenticated users can read calendar_connections"
  ON calendar_connections
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can create or update connections (covers the normal
-- admin-initiated invite flow and any admin corrections).
CREATE POLICY "Admins can insert calendar_connections"
  ON calendar_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update calendar_connections"
  ON calendar_connections
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- Public (anon) role can update a single row only when the request
-- supplies the correct invite_token. This is used by the OAuth
-- completion callback to write back the nango_connection_id without
-- requiring the contact to have a Supabase session.
CREATE POLICY "Public can update row matching invite_token"
  ON calendar_connections
  FOR UPDATE
  TO anon
  USING (
    invite_token IS NOT NULL
    AND invite_token = current_setting('request.jwt.claims', true)::jsonb ->> 'invite_token'
  )
  WITH CHECK (
    invite_token IS NOT NULL
    AND invite_token = current_setting('request.jwt.claims', true)::jsonb ->> 'invite_token'
  );
