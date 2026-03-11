-- Store Late API profile ID per client (profiles group social accounts)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS late_profile_id TEXT;
