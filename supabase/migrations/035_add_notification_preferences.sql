-- Add notification preferences JSONB column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{}'::jsonb;
