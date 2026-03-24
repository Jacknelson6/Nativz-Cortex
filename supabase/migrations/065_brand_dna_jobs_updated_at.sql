-- Last progress write for brand_dna_jobs (stuck-job detection). Application updates this on every job row change.

ALTER TABLE brand_dna_jobs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE brand_dna_jobs
SET updated_at = COALESCE(completed_at, created_at);
