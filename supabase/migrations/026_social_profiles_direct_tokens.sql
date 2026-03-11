-- Add direct token storage to social_profiles (replacing Nango connection IDs)
ALTER TABLE social_profiles
  ADD COLUMN IF NOT EXISTS access_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS page_id TEXT,         -- Facebook/Instagram page ID (needed for page-scoped tokens)
  ADD COLUMN IF NOT EXISTS page_access_token TEXT; -- Long-lived page token for FB/IG (doesn't expire)
