-- Add fallback models array to agency_settings
ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS ai_fallback_models jsonb DEFAULT '[]'::jsonb;

-- Add user tracking columns to api_usage_logs
ALTER TABLE api_usage_logs
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS user_email text;

-- Index for querying usage by user
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_id ON api_usage_logs (user_id);
