-- 225_package_tiers_env_keys.sql
-- Fix Phase D's Stripe price id story.
--
-- Migration 224 baked `${ANDERSON_STRIPE_PRICE_*}` placeholder strings into
-- `package_tiers.stripe_price_id` on the assumption that Postgres would
-- substitute env vars at apply time. Postgres does not do that, so the column
-- now holds the literal placeholder. The Stripe webhook resolves a real
-- price_id to a tier via `WHERE stripe_price_id = $1`, which can never match
-- a real price like `price_1abc...`, leaving the tier-change branch dead.
--
-- Fix: mirror the established addon-skus pattern. Each tier carries an
-- `env_key` suffix (e.g. `STRIPE_PRICE_TIER_ESSENTIALS`); the runtime helper
-- reads `<AGENCY>_<env_key>` and produces the live price id. The webhook
-- builds a reverse lookup at request time. The `stripe_price_id` column
-- becomes nullable + advisory only (kept for ops backfill / debugging).
--
-- Naming follows lib/deliverables/addon-skus.ts so the env scheme stays
-- consistent across tiers + add-ons:
--   ANDERSON_STRIPE_PRICE_TIER_ESSENTIALS
--   ANDERSON_STRIPE_PRICE_TIER_STUDIO
--   ANDERSON_STRIPE_PRICE_TIER_FULL_SOCIAL
-- (Nativz tiers seed in a separate migration when they're announced.)

BEGIN;

-- =====================================================================
-- 1. env_key column
--    Stable identifier suffix; agency prefix applied at runtime.
-- =====================================================================
ALTER TABLE package_tiers
  ADD COLUMN IF NOT EXISTS env_key text;

COMMENT ON COLUMN package_tiers.env_key IS
  'Suffix appended after the agency prefix to read the Stripe price id at runtime (e.g. ANDERSON_${env_key}). Mirrors the addon-skus pattern so all Stripe price ids resolve through env vars instead of being hardcoded into git history.';

-- =====================================================================
-- 2. stripe_price_id becomes nullable
--    The runtime helper is now the source of truth. The column stays for
--    ops debugging (e.g. "what price did we last sync into this row") but
--    NULL is now valid + expected when only the env var is set.
-- =====================================================================
ALTER TABLE package_tiers
  ALTER COLUMN stripe_price_id DROP NOT NULL;

-- =====================================================================
-- 3. Backfill: set env_key on the Anderson seeds, null out placeholder
--    stripe_price_id values that survived from migration 224.
-- =====================================================================
UPDATE package_tiers
SET env_key = 'STRIPE_PRICE_TIER_ESSENTIALS'
WHERE agency = 'anderson' AND slug = 'essentials' AND env_key IS NULL;

UPDATE package_tiers
SET env_key = 'STRIPE_PRICE_TIER_STUDIO'
WHERE agency = 'anderson' AND slug = 'studio' AND env_key IS NULL;

UPDATE package_tiers
SET env_key = 'STRIPE_PRICE_TIER_FULL_SOCIAL'
WHERE agency = 'anderson' AND slug = 'full_social' AND env_key IS NULL;

UPDATE package_tiers
SET stripe_price_id = NULL
WHERE stripe_price_id LIKE '$%';

-- =====================================================================
-- 4. Index on env_key for the runtime catalog read.
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_package_tiers_agency_env_key
  ON package_tiers(agency, env_key)
  WHERE env_key IS NOT NULL;

COMMIT;
