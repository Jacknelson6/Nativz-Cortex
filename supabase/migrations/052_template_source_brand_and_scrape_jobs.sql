-- 052_template_source_brand_and_scrape_jobs.sql
-- Add source_brand to kandy_templates for brand-organized collections
-- Add ad_library_scrape_jobs for tracking ad library scrape jobs

ALTER TABLE kandy_templates
  ADD COLUMN IF NOT EXISTS source_brand text DEFAULT NULL;

UPDATE kandy_templates SET source_brand = collection_name WHERE source_brand IS NULL;

CREATE TABLE IF NOT EXISTS ad_library_scrape_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  library_url text NOT NULL,
  advertiser_name text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'scraping', 'completed', 'failed')),
  total_found int DEFAULT 0,
  imported_count int DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE ad_library_scrape_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage scrape jobs"
  ON ad_library_scrape_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
