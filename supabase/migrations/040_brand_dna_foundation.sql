-- 040_brand_dna_foundation.sql — Brand DNA Engine foundation
-- Adds brand_guideline knowledge entry type support and client onboarding columns

-- Add onboarding and brand DNA status columns to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarded_via TEXT DEFAULT 'manual';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS brand_dna_status TEXT DEFAULT 'none';

-- Constraint for brand_dna_status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_brand_dna_status_check'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_brand_dna_status_check
      CHECK (brand_dna_status IN ('none', 'generating', 'draft', 'active'));
  END IF;
END $$;

-- Brand DNA generation jobs table for progress tracking
CREATE TABLE IF NOT EXISTS brand_dna_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'crawling', 'extracting', 'analyzing', 'compiling', 'completed', 'failed')),
  progress_pct INTEGER NOT NULL DEFAULT 0
    CHECK (progress_pct >= 0 AND progress_pct <= 100),
  step_label TEXT,
  error_message TEXT,
  website_url TEXT,
  pages_crawled INTEGER DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_brand_dna_jobs_client ON brand_dna_jobs(client_id);

-- RLS
ALTER TABLE brand_dna_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage brand_dna_jobs"
  ON brand_dna_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
