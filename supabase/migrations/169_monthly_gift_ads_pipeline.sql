-- 169_monthly_gift_ads_pipeline.sql
-- ----------------------------------------------------------------------------
-- Reference-driven monthly gift ads.
--
-- This replaces the active ad-generator direction with a pipeline built around:
--   1. A global library of proven reference ads synced from Drive.
--   2. Per-client monthly settings for the "20 ads on the 20th" gift workflow.
--   3. Ad concepts that remember which reference ad inspired them and which
--      image model rendered them.

-- ----------------------------------------------------------------------------
-- 1. Proven reference ads
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_reference_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source TEXT NOT NULL DEFAULT 'google_drive',
  source_folder_id TEXT,
  source_folder_name TEXT,
  source_file_id TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_url TEXT NOT NULL,

  -- Public Supabase URL used for vision extraction and admin display.
  image_url TEXT,
  storage_path TEXT,
  mime_type TEXT,
  byte_size BIGINT,

  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  prompt_schema JSONB NOT NULL DEFAULT '{}'::JSONB,
  analysis JSONB NOT NULL DEFAULT '{}'::JSONB,
  performance_notes TEXT,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (source, source_file_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_reference_ads_active_category
  ON ad_reference_ads (is_active, category);

CREATE INDEX IF NOT EXISTS idx_ad_reference_ads_tags
  ON ad_reference_ads USING GIN (tags);

-- ----------------------------------------------------------------------------
-- 2. Monthly automation settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_monthly_generation_settings (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,

  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  day_of_month INT NOT NULL DEFAULT 20 CHECK (day_of_month BETWEEN 1 AND 28),
  monthly_count INT NOT NULL DEFAULT 20 CHECK (monthly_count BETWEEN 1 AND 50),
  aspect_ratio TEXT NOT NULL DEFAULT '1:1',
  render_images BOOLEAN NOT NULL DEFAULT TRUE,

  prompt_notes TEXT,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_monthly_generation_due
  ON ad_monthly_generation_settings (enabled, next_run_at);

-- ----------------------------------------------------------------------------
-- 3. Concept provenance for the new pipeline
-- ----------------------------------------------------------------------------
ALTER TABLE ad_concepts
  ADD COLUMN IF NOT EXISTS reference_ad_id UUID REFERENCES ad_reference_ads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS generation_model TEXT,
  ADD COLUMN IF NOT EXISTS pipeline TEXT NOT NULL DEFAULT 'chat_concepts',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_ad_concepts_reference_ad
  ON ad_concepts(reference_ad_id);

CREATE INDEX IF NOT EXISTS idx_ad_concepts_pipeline_created
  ON ad_concepts(pipeline, created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. updated_at triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_ad_reference_ads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ad_reference_ads_updated_at ON ad_reference_ads;
CREATE TRIGGER trg_ad_reference_ads_updated_at
  BEFORE UPDATE ON ad_reference_ads
  FOR EACH ROW
  EXECUTE FUNCTION set_ad_reference_ads_updated_at();

CREATE OR REPLACE FUNCTION set_ad_monthly_generation_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ad_monthly_generation_settings_updated_at ON ad_monthly_generation_settings;
CREATE TRIGGER trg_ad_monthly_generation_settings_updated_at
  BEFORE UPDATE ON ad_monthly_generation_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_ad_monthly_generation_settings_updated_at();
