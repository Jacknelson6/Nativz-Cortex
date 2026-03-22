-- Add is_owner flag to distinguish account owner from regular team members
-- Owner sees all tasks; team members only see their own
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

-- Promote account owner(s) after first sign-up (whoever should see all team tasks):
-- UPDATE users SET is_owner = true WHERE email = 'owner@your-domain.com';
