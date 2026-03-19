-- 043_static_ad_generation.sql — Static Ad Generator tables, indexes, RLS, and storage buckets

-- ============================================================
-- 1. kandy_templates — Pre-analyzed Kandy ad template reference images
-- ============================================================

CREATE TABLE IF NOT EXISTS kandy_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_name text NOT NULL,
  canva_design_id text NOT NULL,
  page_index int NOT NULL,
  image_url text NOT NULL,
  prompt_schema jsonb,
  vertical text NOT NULL CHECK (vertical IN ('general', 'health_beauty', 'fashion', 'digital_products')),
  format text NOT NULL CHECK (format IN ('feed', 'story')),
  ad_category text CHECK (ad_category IN ('product_hero', 'comparison', 'social_proof', 'sale_discount', 'feature_callout', 'lifestyle', 'testimonial', 'other')),
  aspect_ratio text NOT NULL DEFAULT '1:1' CHECK (aspect_ratio IN ('1:1', '9:16', '4:5')),
  is_favorite bool DEFAULT false,
  is_active bool DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (canva_design_id, page_index)
);

CREATE INDEX IF NOT EXISTS idx_kandy_templates_vertical ON kandy_templates(vertical);
CREATE INDEX IF NOT EXISTS idx_kandy_templates_ad_category ON kandy_templates(ad_category);
CREATE INDEX IF NOT EXISTS idx_kandy_templates_format ON kandy_templates(format);
CREATE INDEX IF NOT EXISTS idx_kandy_templates_is_favorite ON kandy_templates(is_favorite);
CREATE INDEX IF NOT EXISTS idx_kandy_templates_is_active ON kandy_templates(is_active);

ALTER TABLE kandy_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read kandy_templates"
  ON kandy_templates FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 2. ad_prompt_templates — User-uploaded winning ad prompt templates
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_prompt_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  reference_image_url text NOT NULL,
  prompt_schema jsonb NOT NULL,
  aspect_ratio text NOT NULL DEFAULT '1:1' CHECK (aspect_ratio IN ('1:1', '9:16', '4:5')),
  ad_category text,
  tags text[],
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_prompt_templates_client ON ad_prompt_templates(client_id);

ALTER TABLE ad_prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage ad_prompt_templates"
  ON ad_prompt_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. ad_generation_batches — Batch generation jobs
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_generation_batches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'generating', 'completed', 'failed', 'partial')),
  config jsonb NOT NULL,
  total_count int NOT NULL DEFAULT 0,
  completed_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  brand_context_source text NOT NULL DEFAULT 'brand_dna' CHECK (brand_context_source IN ('brand_dna', 'ephemeral_url')),
  ephemeral_url text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ad_generation_batches_client ON ad_generation_batches(client_id);
CREATE INDEX IF NOT EXISTS idx_ad_generation_batches_status ON ad_generation_batches(status);

ALTER TABLE ad_generation_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage ad_generation_batches"
  ON ad_generation_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4. ad_creatives — Generated ad images
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_creatives (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES ad_generation_batches(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  template_id uuid,
  template_source text NOT NULL CHECK (template_source IN ('kandy', 'custom')),
  image_url text NOT NULL,
  aspect_ratio text NOT NULL,
  prompt_used text,
  on_screen_text jsonb,
  product_service text,
  offer text,
  is_favorite bool DEFAULT false,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_client ON ad_creatives(client_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_batch ON ad_creatives(batch_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_is_favorite ON ad_creatives(is_favorite);

ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage ad_creatives"
  ON ad_creatives FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Portal users (viewer role) can only see their organization's ad creatives
CREATE POLICY "Portal users can view own org ad_creatives"
  ON ad_creatives FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT id FROM clients WHERE organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
    )
  );

-- ============================================================
-- 5. Storage buckets
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('ad-creatives', 'ad-creatives', true),
  ('kandy-templates', 'kandy-templates', true)
ON CONFLICT (id) DO NOTHING;

-- ad-creatives bucket policies
CREATE POLICY "Authenticated users can upload ad creatives"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ad-creatives');

CREATE POLICY "Authenticated users can update ad creatives"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ad-creatives');

CREATE POLICY "Authenticated users can delete ad creatives"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ad-creatives');

CREATE POLICY "Public read ad creatives"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'ad-creatives');

-- kandy-templates bucket policies
CREATE POLICY "Authenticated users can upload kandy templates"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kandy-templates');

CREATE POLICY "Authenticated users can update kandy templates"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'kandy-templates');

CREATE POLICY "Authenticated users can delete kandy templates"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kandy-templates');

CREATE POLICY "Public read kandy templates"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'kandy-templates');
