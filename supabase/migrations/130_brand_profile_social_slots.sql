-- 130_brand_profile_social_slots.sql
-- NAT-57 follow-up — brand-native analysis flows
--
-- Applied via Supabase MCP 2026-04-21 (local DNS was unresolvable).
--
-- Goal: every client gets four "social slots" (IG, TT, FB, YT). Each
-- slot is one of: linked, no_account, or unset (no row at all).
-- Analysis tools block on unset slots and silently skip no_account ones.
--
-- Changes:
--   1. social_profiles.platform_user_id + .username become nullable so
--      "no account" rows can exist without a handle.
--   2. social_profiles.no_account boolean — admin explicitly declared
--      the client is NOT on this platform. Tokens/handles ignored.
--   3. social_profiles.website_scraped — the row was seeded from a
--      website scrape (vs Zernio OAuth or manual paste). Future UI
--      can surface "we found this handle on your site, please confirm."
--   4. social_profiles unique indexes — one row per (client, platform);
--      existing (platform, platform_user_id) unique becomes partial so
--      multiple rows with NULL platform_user_id don't collide.
--   5. CHECK constraint: no_account=TRUE rows are empty of handle data.
--   6. New `competitors` parent table — groups platform rows under one
--      brand entity so "add competitor X with their IG + TT + FB + YT
--      handles" is a single concept in the UI.
--   7. client_competitors.competitor_id FK — nullable so legacy rows
--      (inserted before this migration) don't fail.
--   8. client_competitors.website_scraped — same intent as (3).

ALTER TABLE social_profiles
  ALTER COLUMN platform_user_id DROP NOT NULL;

ALTER TABLE social_profiles
  ALTER COLUMN username DROP NOT NULL;

ALTER TABLE social_profiles
  ADD COLUMN IF NOT EXISTS no_account BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE social_profiles
  ADD COLUMN IF NOT EXISTS website_scraped BOOLEAN NOT NULL DEFAULT FALSE;

DROP INDEX IF EXISTS idx_social_profiles_platform_user;
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_profiles_platform_user
  ON social_profiles (platform, platform_user_id)
  WHERE platform_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_profiles_client_platform
  ON social_profiles (client_id, platform);

ALTER TABLE social_profiles DROP CONSTRAINT IF EXISTS social_profiles_no_account_clean;
ALTER TABLE social_profiles
  ADD CONSTRAINT social_profiles_no_account_clean CHECK (
    no_account = FALSE OR (
      platform_user_id IS NULL
      AND username IS NULL
      AND access_token_ref IS NULL
      AND late_account_id IS NULL
    )
  );

CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  website_url TEXT,
  notes TEXT,
  website_scraped BOOLEAN NOT NULL DEFAULT FALSE,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access on competitors" ON competitors;
CREATE POLICY "Admins full access on competitors"
  ON competitors FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_competitors_client ON competitors(client_id);

ALTER TABLE client_competitors
  ADD COLUMN IF NOT EXISTS competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE;

ALTER TABLE client_competitors
  ADD COLUMN IF NOT EXISTS website_scraped BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_client_competitors_competitor
  ON client_competitors(competitor_id)
  WHERE competitor_id IS NOT NULL;
