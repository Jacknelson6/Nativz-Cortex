-- Per-client ad generation defaults: advertising vertical + image prompt modifier (from Brand DNA pipeline).

CREATE TABLE IF NOT EXISTS client_ad_generation_settings (
  client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  advertising_type text NOT NULL DEFAULT 'product_dtc'
    CHECK (advertising_type IN ('product_dtc', 'saas_service', 'marketplace', 'local_service')),
  image_prompt_modifier text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_ad_generation_settings_updated
  ON client_ad_generation_settings (updated_at DESC);

ALTER TABLE client_ad_generation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage client_ad_generation_settings"
  ON client_ad_generation_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow global Nano Banana catalog rows in ad_creatives
ALTER TABLE ad_creatives DROP CONSTRAINT IF EXISTS ad_creatives_template_source_check;

ALTER TABLE ad_creatives
  ADD CONSTRAINT ad_creatives_template_source_check
  CHECK (template_source IN ('kandy', 'custom', 'global'));
