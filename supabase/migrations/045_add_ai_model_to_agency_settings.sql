-- Add ai_model column to agency_settings for platform-wide model configuration
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS ai_model text DEFAULT 'anthropic/claude-3.5-haiku';
