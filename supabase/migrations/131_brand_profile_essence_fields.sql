-- 131_brand_profile_essence_fields.sql
-- NAT-57 follow-up — RankPrompt-style brand profile fields.
--
-- Applied via Supabase MCP 2026-04-21 (local DNS unresolvable).
--
-- Adds the fields Jack chose after reviewing the full RankPrompt list:
--   - Essence trio (tagline / value_proposition / mission_statement) —
--     AI-generatable from existing brand data, but editable by admins.
--   - Products + brand aliases arrays (categories are covered via the
--     existing topic_keywords + category columns).
--   - Content generation preferences beyond brand_voice: writing_style,
--     ai_image_style, banned_phrases (array), content_language.
--   - Default location — flexible granularity. country required if any
--     location field is set; state + city progressively narrower. Admin
--     can pick any level (wide → country only; granular → country +
--     state + city).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS tagline TEXT,
  ADD COLUMN IF NOT EXISTS value_proposition TEXT,
  ADD COLUMN IF NOT EXISTS mission_statement TEXT,
  ADD COLUMN IF NOT EXISTS products TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS brand_aliases TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS writing_style TEXT,
  ADD COLUMN IF NOT EXISTS ai_image_style TEXT,
  ADD COLUMN IF NOT EXISTS banned_phrases TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS content_language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS primary_country TEXT,
  ADD COLUMN IF NOT EXISTS primary_state TEXT,
  ADD COLUMN IF NOT EXISTS primary_city TEXT;

-- Integrity: state or city set without country doesn't make sense.
-- Allow state without city (regional brand) and city without state
-- (city-state countries like Singapore) for flexibility.
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_location_granularity;
ALTER TABLE clients
  ADD CONSTRAINT clients_location_granularity CHECK (
    (primary_country IS NOT NULL) OR
    (primary_state IS NULL AND primary_city IS NULL)
  );
