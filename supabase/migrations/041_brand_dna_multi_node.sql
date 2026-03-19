-- 041_brand_dna_multi_node.sql — Brand DNA multi-node split
-- Adds new entry types for split Brand DNA nodes and ensures embedding column exists

-- Widen the type CHECK constraint to include new Brand DNA sub-types
ALTER TABLE client_knowledge_entries DROP CONSTRAINT IF EXISTS client_knowledge_entries_type_check;
ALTER TABLE client_knowledge_entries ADD CONSTRAINT client_knowledge_entries_type_check
  CHECK (type IN (
    -- Existing types
    'brand_asset', 'brand_profile', 'brand_guideline', 'document',
    'web_page', 'note', 'idea', 'meeting_note',
    -- Brand DNA sub-types
    'visual_identity', 'verbal_identity', 'target_audience',
    'competitive_positioning', 'product_catalog',
    'brand_logo', 'brand_screenshot'
  ));

-- Ensure embedding column exists for semantic search (may already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_knowledge_entries' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE client_knowledge_entries ADD COLUMN embedding vector(768);
  END IF;
END $$;

-- Ensure index exists for vector similarity search
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_embedding
  ON client_knowledge_entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
