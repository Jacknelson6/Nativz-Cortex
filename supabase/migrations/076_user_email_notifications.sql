-- Add email notification preference to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true;

COMMENT ON COLUMN users.email_notifications IS 'Whether user receives email notifications (e.g. search completion)';
