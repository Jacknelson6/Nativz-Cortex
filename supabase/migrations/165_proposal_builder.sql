-- 165_proposal_builder.sql — chat-driven proposal builder schema
-- ----------------------------------------------------------------------------
-- The legacy proposal flow asks the admin to pick a fixed template (e.g.
-- "Bronze / Silver / Gold") and accepts whatever tier prices live on the
-- template. The new chat-driven flow lets the admin compose a proposal
-- one service at a time with deterministic pricing pulled from this
-- catalog, then iterate inline with the agent + a live preview before
-- committing to the canonical `proposals` row.
--
-- Three tables ship in this slice:
--
--   1. proposal_services
--      Per-agency service catalog. Each row is one service the chat
--      can add to a draft (e.g. "Short-form video production" priced
--      per video). Bulk-seed by pasting an existing proposal markdown
--      and letting the LLM extract.
--
--   2. proposal_pricing_rules
--      Discount + override rules attached to a service (or the whole
--      proposal). Supports min-quantity, min-total, cadence-based, and
--      manually-applied rules. Discount value is one of: percent, flat
--      cents off, or a per-unit price override.
--
--   3. proposal_drafts
--      In-progress proposals before they become real `proposals` rows.
--      Carries service_lines (with applied rules), custom_blocks (image
--      and markdown insertions from the chat), signer fields, and a
--      back-ref to the committed proposal once finalised.

-- ──────────────────────────────────────────────────────────────────────
-- 1. proposal_services
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proposal_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency TEXT NOT NULL CHECK (agency IN ('anderson', 'nativz')),
  -- Slug is unique per agency — same service can exist for both brands
  -- with different pricing.
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('social', 'paid_media', 'web', 'creative', 'strategy', 'other')),
  description TEXT,                         -- one-liner shown in chat picker
  scope_md TEXT,                            -- detailed scope (renders in proposal body)
  included_items JSONB NOT NULL DEFAULT '[]'::jsonb,  -- string[]
  billing_unit TEXT NOT NULL
    CHECK (billing_unit IN ('per_video', 'per_post', 'per_month', 'per_year', 'per_quarter', 'flat', 'per_hour', 'per_unit')),
  base_unit_price_cents INTEGER NOT NULL CHECK (base_unit_price_cents >= 0),
  default_quantity INTEGER NOT NULL DEFAULT 1 CHECK (default_quantity > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agency, slug)
);

CREATE INDEX IF NOT EXISTS proposal_services_agency_idx ON proposal_services (agency, active);
CREATE INDEX IF NOT EXISTS proposal_services_category_idx ON proposal_services (agency, category, active);

-- ──────────────────────────────────────────────────────────────────────
-- 2. proposal_pricing_rules
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proposal_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL service_id = rule applies to whole proposal (e.g. annual prepay).
  service_id UUID REFERENCES proposal_services(id) ON DELETE CASCADE,
  agency TEXT NOT NULL CHECK (agency IN ('anderson', 'nativz')),
  scope TEXT NOT NULL CHECK (scope IN ('service', 'proposal')),
  trigger_kind TEXT NOT NULL
    CHECK (trigger_kind IN ('min_quantity', 'min_total_cents', 'cadence', 'manual')),
  trigger_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Examples:
  --   {"quantity": 12}            for min_quantity
  --   {"cents": 100000}           for min_total_cents
  --   {"cadence": "annual"}       for cadence (paid 12mo upfront)
  --   {}                          for manual (admin or chat applies it)
  discount_kind TEXT NOT NULL
    CHECK (discount_kind IN ('pct', 'flat_cents', 'unit_price_override')),
  discount_value JSONB NOT NULL,
  -- Examples:
  --   {"pct": 10}                 for pct (10% off)
  --   {"cents": 50000}            for flat_cents ($500 off the line/total)
  --   {"new_unit_cents": 12500}   for unit_price_override (override per-unit price)
  label TEXT NOT NULL,                      -- human-readable line on the proposal
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Sanity: per-proposal rules don't reference a service.
  CONSTRAINT proposal_pricing_rules_scope_consistent
    CHECK ((scope = 'service' AND service_id IS NOT NULL) OR (scope = 'proposal' AND service_id IS NULL))
);

CREATE INDEX IF NOT EXISTS proposal_pricing_rules_service_idx
  ON proposal_pricing_rules (service_id, active) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS proposal_pricing_rules_proposal_idx
  ON proposal_pricing_rules (agency, scope, active) WHERE scope = 'proposal';

-- ──────────────────────────────────────────────────────────────────────
-- 3. proposal_drafts
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proposal_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency TEXT NOT NULL CHECK (agency IN ('anderson', 'nativz')),
  -- Optional client linkage. NULL = prospect (signer fields stand alone).
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  -- Optional flow linkage. When chat is invoked from /admin/onboarding/[id]
  -- the draft hangs off that flow so commit auto-attaches.
  flow_id UUID REFERENCES onboarding_flows(id) ON DELETE SET NULL,

  title TEXT,                               -- "Acme Q3 social retainer" etc.

  -- Signer (mirrors `proposals.signer_*`). Filled either via
  -- update_draft_signer or auto-derived from the tagged client's primary
  -- contact at create time.
  signer_name TEXT,
  signer_email TEXT,
  signer_title TEXT,
  signer_legal_entity TEXT,
  signer_address TEXT,

  -- service_lines: array of
  --   { id, service_id, service_slug_snapshot, name_snapshot,
  --     quantity, unit_price_cents, billing_unit_snapshot,
  --     applied_rule_ids: [], note? }
  -- service_id is nullable so the chat can add a one-off line that
  -- isn't in the catalog yet (e.g. a custom add-on).
  service_lines JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- custom_blocks: rich content the chat or admin drops in.
  --   { id, kind: 'markdown' | 'image', content, position }
  -- Rendered between scope and signature in the preview.
  custom_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Computed totals — refreshed by the draft engine on every mutation.
  -- We store them rather than computing on read so the preview iframe
  -- can render purely from this row.
  subtotal_cents INTEGER,
  total_cents INTEGER,
  deposit_cents INTEGER,
  -- One of 'one_off' (deposit + balance) | 'subscription' (recurring)
  payment_model TEXT NOT NULL DEFAULT 'one_off'
    CHECK (payment_model IN ('one_off', 'subscription')),
  cadence TEXT CHECK (cadence IS NULL OR cadence IN ('week', 'month', 'quarter', 'year')),

  status TEXT NOT NULL DEFAULT 'drafting'
    CHECK (status IN ('drafting', 'ready', 'committed', 'discarded')),
  -- Set to the canonical `proposals.id` once commit_proposal_draft runs.
  committed_proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS proposal_drafts_client_idx
  ON proposal_drafts (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS proposal_drafts_flow_idx
  ON proposal_drafts (flow_id) WHERE flow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS proposal_drafts_creator_idx
  ON proposal_drafts (created_by, status, updated_at DESC);

-- ──────────────────────────────────────────────────────────────────────
-- Updated-at triggers (reuse the existing onboarding helper or proposals helper).
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_proposal_builder_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS proposal_services_set_updated_at ON proposal_services;
CREATE TRIGGER proposal_services_set_updated_at
  BEFORE UPDATE ON proposal_services
  FOR EACH ROW EXECUTE FUNCTION set_proposal_builder_updated_at();

DROP TRIGGER IF EXISTS proposal_pricing_rules_set_updated_at ON proposal_pricing_rules;
CREATE TRIGGER proposal_pricing_rules_set_updated_at
  BEFORE UPDATE ON proposal_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION set_proposal_builder_updated_at();

DROP TRIGGER IF EXISTS proposal_drafts_set_updated_at ON proposal_drafts;
CREATE TRIGGER proposal_drafts_set_updated_at
  BEFORE UPDATE ON proposal_drafts
  FOR EACH ROW EXECUTE FUNCTION set_proposal_builder_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- RLS — admin only across all three. The chat tool layer is the only
-- public gateway, and it goes through requireAdmin().
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE proposal_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_services admin all" ON proposal_services;
CREATE POLICY "proposal_services admin all"
  ON proposal_services FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)));

DROP POLICY IF EXISTS "proposal_pricing_rules admin all" ON proposal_pricing_rules;
CREATE POLICY "proposal_pricing_rules admin all"
  ON proposal_pricing_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)));

DROP POLICY IF EXISTS "proposal_drafts admin all" ON proposal_drafts;
CREATE POLICY "proposal_drafts admin all"
  ON proposal_drafts FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.is_super_admin = TRUE)));

-- ──────────────────────────────────────────────────────────────────────
-- Seed: Social services for both agencies with placeholder prices the
-- admin will edit at /admin/proposals/services after Phase B lands.
-- Prices reflect Jack's "$150/video" anchor; everything else is a
-- starting point.
-- ──────────────────────────────────────────────────────────────────────

INSERT INTO proposal_services (agency, slug, name, category, description, scope_md, included_items, billing_unit, base_unit_price_cents, default_quantity)
VALUES
  -- Anderson
  ('anderson', 'short-form-video', 'Short-form video production', 'social',
    'Vertical short-form video, fully edited and ready to post.',
    '## Short-form video production

Each deliverable is a 15–60s vertical (1080×1920) short-form video, fully edited, captioned, and music-licensed. Includes raw footage review, two rounds of revisions, and final delivery in 1080p MP4.',
    '["1080×1920 vertical, 15–60s", "Captions burned in", "Licensed music", "Up to two rounds of revisions", "Final 1080p MP4 delivery"]'::jsonb,
    'per_video', 15000, 1),
  ('anderson', 'tiktok-organic-mgmt', 'TikTok organic management', 'social',
    'Account-level posting cadence, creative direction, and engagement.',
    '## TikTok organic management

Monthly retainer covering: posting cadence (8–12 videos / month), creative direction, hook iteration, hashtag + sound research, comment engagement, and a monthly performance review.',
    '["8–12 videos posted per month", "Creative direction + hook iteration", "Comment engagement", "Monthly performance review"]'::jsonb,
    'per_month', 250000, 1),
  ('anderson', 'meta-organic-mgmt', 'Meta (IG + FB) organic management', 'social',
    'Posting + cross-posting + community management on IG and FB.',
    '## Meta organic management

Monthly retainer covering Instagram and Facebook organic posting, cross-posting from short-form deliverables, story rotations, and community management.',
    '["Posting + cross-posting", "Stories rotation", "Community management", "Monthly performance review"]'::jsonb,
    'per_month', 200000, 1),
  ('anderson', 'youtube-shorts', 'YouTube Shorts production', 'social',
    'Vertical Shorts re-cut from short-form deliverables.',
    '## YouTube Shorts production

Re-purposing short-form deliverables for YouTube Shorts, including platform-specific framing, captions, and metadata.',
    '["Re-cut + reformat from short-form deliverable", "Platform-specific captions", "SEO metadata"]'::jsonb,
    'per_video', 5000, 1),
  ('anderson', 'social-strategy-retainer', 'Social strategy retainer', 'strategy',
    'Monthly creative direction + content pillars + sprint planning.',
    '## Social strategy retainer

Defines the brand''s content pillars, monthly sprint plans, hook batches, and creative direction. Pairs with one or more production retainers above.',
    '["Quarterly content pillar review", "Monthly sprint plan", "Hook batches", "Standing creative review call"]'::jsonb,
    'per_month', 150000, 1),
  -- Nativz mirrors AC at the same starting prices; the admin tunes per agency.
  ('nativz', 'short-form-video', 'Short-form video production', 'social',
    'Vertical short-form video, fully edited and ready to post.',
    '## Short-form video production

Each deliverable is a 15–60s vertical (1080×1920) short-form video, fully edited, captioned, and music-licensed.',
    '["1080×1920 vertical, 15–60s", "Captions burned in", "Licensed music", "Up to two rounds of revisions", "Final 1080p MP4 delivery"]'::jsonb,
    'per_video', 15000, 1),
  ('nativz', 'tiktok-organic-mgmt', 'TikTok organic management', 'social',
    'Account-level posting cadence, creative direction, and engagement.',
    '## TikTok organic management

Monthly retainer covering: posting cadence (8–12 videos / month), creative direction, hook iteration, hashtag + sound research, comment engagement, and a monthly performance review.',
    '["8–12 videos posted per month", "Creative direction + hook iteration", "Comment engagement", "Monthly performance review"]'::jsonb,
    'per_month', 250000, 1),
  ('nativz', 'meta-organic-mgmt', 'Meta (IG + FB) organic management', 'social',
    'Posting + cross-posting + community management on IG and FB.',
    '## Meta organic management

Monthly retainer covering Instagram and Facebook organic posting, cross-posting from short-form deliverables, story rotations, and community management.',
    '["Posting + cross-posting", "Stories rotation", "Community management", "Monthly performance review"]'::jsonb,
    'per_month', 200000, 1),
  ('nativz', 'youtube-shorts', 'YouTube Shorts production', 'social',
    'Vertical Shorts re-cut from short-form deliverables.',
    '## YouTube Shorts production

Re-purposing short-form deliverables for YouTube Shorts, including platform-specific framing, captions, and metadata.',
    '["Re-cut + reformat from short-form deliverable", "Platform-specific captions", "SEO metadata"]'::jsonb,
    'per_video', 5000, 1),
  ('nativz', 'social-strategy-retainer', 'Social strategy retainer', 'strategy',
    'Monthly creative direction + content pillars + sprint planning.',
    '## Social strategy retainer

Defines the brand''s content pillars, monthly sprint plans, hook batches, and creative direction.',
    '["Quarterly content pillar review", "Monthly sprint plan", "Hook batches", "Standing creative review call"]'::jsonb,
    'per_month', 150000, 1)
ON CONFLICT (agency, slug) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────
-- Storage bucket for chat-dropped images. Public-read so the preview
-- iframe and the eventual rendered proposal can <img src=…> without
-- juggling signed URLs.
-- ──────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('proposal-draft-images', 'proposal-draft-images', true)
ON CONFLICT (id) DO NOTHING;

-- Seed two starter pricing rules per agency:
--   1. 12+ short-form videos: 10% off the line.
--   2. Annual prepay: 10% off the whole proposal.
INSERT INTO proposal_pricing_rules (service_id, agency, scope, trigger_kind, trigger_value, discount_kind, discount_value, label)
SELECT s.id, s.agency, 'service', 'min_quantity', '{"quantity": 12}'::jsonb, 'pct', '{"pct": 10}'::jsonb,
       'Bulk discount: 10% off short-form video when ordering 12+'
FROM proposal_services s
WHERE s.slug = 'short-form-video'
ON CONFLICT DO NOTHING;

INSERT INTO proposal_pricing_rules (service_id, agency, scope, trigger_kind, trigger_value, discount_kind, discount_value, label)
VALUES
  (NULL, 'anderson', 'proposal', 'cadence', '{"cadence": "annual"}'::jsonb, 'pct', '{"pct": 10}'::jsonb,
    'Annual prepay: 10% off the whole proposal'),
  (NULL, 'nativz', 'proposal', 'cadence', '{"cadence": "annual"}'::jsonb, 'pct', '{"pct": 10}'::jsonb,
    'Annual prepay: 10% off the whole proposal')
ON CONFLICT DO NOTHING;
