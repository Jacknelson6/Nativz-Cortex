-- Client avatar overhaul (PRD A).
--
-- We now resolve `clients.logo_url` from a real social profile picture during
-- onboarding rather than falling back to a generic favicon / Google globe.
-- The chain is Instagram -> Facebook -> YouTube -> TikTok -> LinkedIn -> favicon.
-- These two columns record which leg of the chain delivered the current logo so
-- admins can see the provenance and the backfill / refresh-logo flows know
-- which rows still need an upgrade.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS logo_source text NULL,
  ADD COLUMN IF NOT EXISTS logo_resolved_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'clients_logo_source_check'
  ) THEN
    ALTER TABLE clients
      ADD CONSTRAINT clients_logo_source_check
      CHECK (logo_source IS NULL OR logo_source IN (
        'instagram', 'facebook', 'youtube', 'tiktok', 'linkedin', 'favicon', 'manual_upload'
      ));
  END IF;
END
$$;

COMMENT ON COLUMN clients.logo_source IS
  'Which leg of the avatar resolver delivered the current logo_url. NULL means legacy / unset; manual_upload is reserved for the future drag-drop flow.';
COMMENT ON COLUMN clients.logo_resolved_at IS
  'Timestamp the resolver last wrote logo_url. Backfill + Refresh logo update this; manual edits leave it as-is.';
