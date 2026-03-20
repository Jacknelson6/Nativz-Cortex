-- 051_ad_batch_placeholder_config.sql
-- Add placeholder_config for gallery placeholders during generation

ALTER TABLE ad_generation_batches
  ADD COLUMN IF NOT EXISTS placeholder_config jsonb DEFAULT NULL;

COMMENT ON COLUMN ad_generation_batches.placeholder_config IS
  'Brand colors and template thumbnails for rendering gallery placeholders during generation';
