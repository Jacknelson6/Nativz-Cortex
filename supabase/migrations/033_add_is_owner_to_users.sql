-- Add is_owner flag to distinguish account owner from regular team members
-- Owner sees all tasks; team members only see their own
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

-- Set Jack as owner (the only current user)
UPDATE users SET is_owner = true WHERE email = 'Jack@nativz.io';
