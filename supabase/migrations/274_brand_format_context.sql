-- ============================================================
-- VFF-02: Brand-aware ingestion context, one row per client
-- Downstream consumers: VFF-03 (scraping), VFF-04 (gating),
-- VFF-08 (ranking). Holds seeds/exclusions/creators/tone +
-- a Gemini embedding for cosine comparison against viral_videos.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS brand_format_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  seed_terms TEXT[] NOT NULL DEFAULT '{}',
  excluded_terms TEXT[] NOT NULL DEFAULT '{}',
  reference_creator_handles JSONB NOT NULL DEFAULT '{"tiktok":[],"instagram":[],"youtube":[]}'::jsonb,
  pillar_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  tone_descriptors TEXT[] NOT NULL DEFAULT '{}',
  seed_embedding VECTOR(1536),
  source TEXT NOT NULL DEFAULT 'auto'
    CHECK (source IN ('auto','manual','mixed')),
  last_recomputed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_format_context_client
  ON brand_format_context(client_id);

DROP TRIGGER IF EXISTS trg_brand_format_context_updated ON brand_format_context;
CREATE TRIGGER trg_brand_format_context_updated
  BEFORE UPDATE ON brand_format_context
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE brand_format_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_format_context_admin_all ON brand_format_context;
CREATE POLICY brand_format_context_admin_all ON brand_format_context
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND (users.role IN ('admin','super_admin') OR users.is_super_admin = true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND (users.role IN ('admin','super_admin') OR users.is_super_admin = true)
  ));
