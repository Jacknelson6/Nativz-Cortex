-- Allow user-stopped ad generation batches (orchestrator exits early; in-flight images may still finish).
ALTER TABLE ad_generation_batches DROP CONSTRAINT IF EXISTS ad_generation_batches_status_check;
ALTER TABLE ad_generation_batches ADD CONSTRAINT ad_generation_batches_status_check
  CHECK (status IN ('queued', 'generating', 'completed', 'failed', 'partial', 'cancelled'));
