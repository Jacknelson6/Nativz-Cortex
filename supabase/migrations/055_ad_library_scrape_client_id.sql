ALTER TABLE ad_library_scrape_jobs
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ad_library_scrape_jobs_client
  ON ad_library_scrape_jobs(client_id);
