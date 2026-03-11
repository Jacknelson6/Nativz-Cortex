-- Add nango_connection_id to users table for Google Calendar OAuth via Nango
ALTER TABLE users ADD COLUMN IF NOT EXISTS nango_connection_id text;
