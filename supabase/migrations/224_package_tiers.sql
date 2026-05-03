-- 224_package_tiers.sql
-- Phase D of the credits → deliverables pivot: introduce `package_tiers` as a
-- first-class entity (Essentials / Studio / Full Social per agency), tie each
-- per-(client, type) balance row to a tier, and stamp a Rush Delivery flag on
-- credit_transactions so the SLA add-on (Phase B stub) is queryable.
--
-- Naming notes:
--   - The PRD references `deliverable_transactions` and
--     `client_deliverable_balances`; the codebase keeps the internal-accounting
--     tables under their original `credit_*` names per CLAUDE.md ("DB stays
--     credit_*; client surfaces speak deliverables"). This migration adapts
--     the PRD's column adds onto the real tables.
--   - The PRD calls for `grant_manual` proration rows; we use the existing
--     `adjust` kind (proration is exactly a manual adjustment) with a
--     descriptive note. This avoids loosening the kind CHECK constraint or
--     widening `CreditTransactionKind`.

BEGIN;

-- =====================================================================
-- 1. package_tiers: SKU registry (Essentials/Studio/Full Social, scoped per agency)
-- =====================================================================
CREATE TABLE IF NOT EXISTS package_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency text NOT NULL CHECK (agency IN ('nativz', 'anderson')),
  slug text NOT NULL,
  display_name text NOT NULL,
  blurb text NOT NULL,
  price_cents integer NOT NULL,
  monthly_term_minimum_months integer NOT NULL DEFAULT 3,
  stripe_price_id text NOT NULL,
  sort_order integer NOT NULL,
  is_best_value boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  scope_in text NOT NULL,                       -- newline-separated bullet list
  scope_out text NOT NULL,                      -- single sentence
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency, slug)
);

COMMENT ON TABLE package_tiers IS
  'Phase D: named retainer SKUs. One row per (agency, slug). Wired to client_credit_balances.package_tier_id so the per-type allowance derives from the tier rather than free-form admin input. Stripe price IDs match the live products that drive customer.subscription.updated webhooks.';

CREATE TABLE IF NOT EXISTS package_tier_allotments (
  package_tier_id uuid NOT NULL REFERENCES package_tiers(id) ON DELETE CASCADE,
  deliverable_type_id uuid NOT NULL REFERENCES deliverable_types(id),
  monthly_count integer NOT NULL,
  rollover_policy text NOT NULL DEFAULT 'none' CHECK (rollover_policy IN ('none','cap','unlimited')),
  rollover_cap integer,
  PRIMARY KEY (package_tier_id, deliverable_type_id)
);

COMMENT ON TABLE package_tier_allotments IS
  'Phase D: per-deliverable-type counts a tier grants each period. Used by apply-tier-change.ts to derive the new monthly_allowance / rollover settings on tier assignment, and by the Stripe webhook handler to prorate the delta when a client switches tier mid-period.';

-- =====================================================================
-- 2. client_credit_balances.package_tier_id
--    Optional FK; null until the client is assigned a tier. Admin override
--    can keep the per-type allowance free-form (no tier) for legacy clients.
-- =====================================================================
ALTER TABLE client_credit_balances
  ADD COLUMN IF NOT EXISTS package_tier_id uuid REFERENCES package_tiers(id);

COMMENT ON COLUMN client_credit_balances.package_tier_id IS
  'Phase D: when set, this row''s monthly_allowance / rollover settings are derived from the tier''s allotment for this deliverable_type_id. NULL means free-form admin override (legacy clients pre-tier).';

-- =====================================================================
-- 3. credit_transactions.rush_delivery
--    Phase B introduced the Rush SLA add-on without a way to mark the
--    specific deliverable that's flagged Rush. This column lights up the
--    flag on the consume row created when a Rush deliverable is approved.
-- =====================================================================
ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS rush_delivery boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN credit_transactions.rush_delivery IS
  'Phase D: TRUE when this transaction''s deliverable was upgraded to Rush SLA. Stamped at consume-time via the rush add-on purchase flow; queryable by ops dashboards to see how much of throughput is rushed.';

-- =====================================================================
-- 4. clients.allow_silent_overage
--    Per-client opt-out for the Phase D soft-block pre-approval modal.
--    Default false: the modal blocks approval at balance = 0 unless an
--    add-on is purchased. Setting true preserves Phase A/B behavior of
--    silently going negative for clients where over-delivery is the norm.
-- =====================================================================
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS allow_silent_overage boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN clients.allow_silent_overage IS
  'Phase D: when TRUE, the soft-block pre-approval modal is bypassed and the consume RPC fires regardless of balance. Default FALSE so new clients see the gate.';

-- =====================================================================
-- 5. Anderson Collaborative tier seeds
--    Stripe price IDs use ${ANDERSON_STRIPE_PRICE_*} placeholders so the
--    seed migration is portable; deploy-time substitution writes the real
--    ids in. Until the env vars resolve, the placeholder lets the row
--    exist but the tier won't match webhook lookups.
-- =====================================================================
INSERT INTO package_tiers (agency, slug, display_name, blurb, price_cents,
  stripe_price_id, sort_order, is_best_value, scope_in, scope_out)
VALUES
  ('anderson', 'essentials', 'Essentials',
   'Editing from client-supplied raw assets',
   150000, '${ANDERSON_STRIPE_PRICE_ESSENTIALS}', 10, false,
   E'Professional editing of your raw footage\nPlatform-optimized (IG, TikTok, Reels, Shorts)\nCaptions and text overlays\nMusic selection and audio polish\nOne round of revisions, monthly drive delivery',
   'Long-form content, ad creative, and paid spend management are out of scope.'),
  ('anderson', 'studio', 'Studio',
   'Editing from client-supplied raw assets + Cortex included',
   250000, '${ANDERSON_STRIPE_PRICE_STUDIO}', 20, true,
   E'Everything in Essentials, plus:\n50 static graphics produced monthly with Cortex\nAI-generated content variants\nSplit-test variants (2-3 per concept)\nCaption copywriting + 30-day content calendar\nCortex social listening included',
   'On-site production, paid social management, and UGC creator outreach are out of scope.'),
  ('anderson', 'full_social', 'Full Social',
   'Full social media management + UGC + Cortex included',
   445000, '${ANDERSON_STRIPE_PRICE_FULL_SOCIAL}', 30, false,
   E'Everything in Studio, plus:\n5 UGC videos per month\n100 static graphics produced monthly with Cortex\nMonthly on-site production day\nFull social media management\n$150/mo boosting budget included\nMonthly reports + bi-weekly strategy calls\nFull Cortex dashboard + weekly reports',
   'Long-form content production and paid spend above $150/mo are billed separately.')
ON CONFLICT (agency, slug) DO NOTHING;

-- Anderson allotments per tier × deliverable type
WITH t AS (
  SELECT id, slug FROM package_tiers WHERE agency = 'anderson'
), dt AS (
  SELECT id, slug FROM deliverable_types
)
INSERT INTO package_tier_allotments (package_tier_id, deliverable_type_id, monthly_count, rollover_policy)
SELECT t.id, dt.id, c.count, 'none'
FROM (VALUES
  ('essentials',  'edited_video',   10),
  ('studio',      'edited_video',   20),
  ('studio',      'static_graphic', 50),
  ('full_social', 'edited_video',   20),
  ('full_social', 'ugc_video',       5),
  ('full_social', 'static_graphic',100)
) AS c(tier_slug, type_slug, count)
JOIN t ON t.slug = c.tier_slug
JOIN dt ON dt.slug = c.type_slug
ON CONFLICT (package_tier_id, deliverable_type_id) DO NOTHING;

-- =====================================================================
-- 6. Indexes
-- =====================================================================
-- Tier lookups by stripe_price_id are the hot path inside the
-- subscription.updated webhook handler.
CREATE INDEX IF NOT EXISTS idx_package_tiers_stripe_price_id
  ON package_tiers(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_package_tiers_agency_active
  ON package_tiers(agency, is_active, sort_order);

-- Rush filtering for ops dashboards: 'find rushed deliverables for client X
-- this period' becomes a small index scan instead of a seq scan over the
-- whole ledger.
CREATE INDEX IF NOT EXISTS idx_credit_tx_rush_delivery
  ON credit_transactions(client_id, created_at DESC)
  WHERE rush_delivery = true;

-- Widen the idempotency uniqueness to cover 'adjust'. Phase D's
-- apply-tier-change writes adjust rows keyed by
-- `tier-change:{client}:{tier}:{period}:{type}` and depends on the unique
-- constraint to make replays atomic instead of racing on a SELECT-then-INSERT.
DROP INDEX IF EXISTS idx_credit_tx_idempotency_key_unique;
CREATE UNIQUE INDEX idx_credit_tx_idempotency_key_unique
  ON credit_transactions (idempotency_key)
  WHERE (kind IN ('grant_topup', 'expire', 'adjust') AND idempotency_key IS NOT NULL);

-- =====================================================================
-- 7. RLS
--    package_tiers + allotments are admin-readable globally (the tier
--    catalog is public to admins regardless of agency). Read access for
--    portal users is gated through the application layer (queries always
--    filter by agency to avoid showing Nativz tiers in an Anderson portal
--    or vice versa). Writes are admin-only.
-- =====================================================================
ALTER TABLE package_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_tier_allotments ENABLE ROW LEVEL SECURITY;

-- Service role has full access (admin client uses it).
DROP POLICY IF EXISTS package_tiers_service ON package_tiers;
CREATE POLICY package_tiers_service ON package_tiers
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS package_tier_allotments_service ON package_tier_allotments;
CREATE POLICY package_tier_allotments_service ON package_tier_allotments
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Authenticated users can read the catalog (portals filter by agency client-side).
DROP POLICY IF EXISTS package_tiers_read ON package_tiers;
CREATE POLICY package_tiers_read ON package_tiers
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS package_tier_allotments_read ON package_tier_allotments;
CREATE POLICY package_tier_allotments_read ON package_tier_allotments
  FOR SELECT USING (auth.role() = 'authenticated');

COMMIT;
