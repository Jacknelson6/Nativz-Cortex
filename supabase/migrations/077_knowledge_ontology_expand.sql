-- 077: Knowledge ontology expansion (PRD knowledge base rebuild)
-- Adds new entry types, broadens link label index, active index, RPC history,
-- and replaces get_current_knowledge with type-filtered variant.

-- ── Widen entry type constraint (new ontology + legacy) ────────────────────

ALTER TABLE client_knowledge_entries
  DROP CONSTRAINT IF EXISTS client_knowledge_entries_type_check;

ALTER TABLE client_knowledge_entries
  ADD CONSTRAINT client_knowledge_entries_type_check
  CHECK (type IN (
    -- New ontology
    'document', 'meeting', 'decision', 'action_item', 'guideline',
    'person', 'competitor', 'claim', 'campaign', 'product', 'insight',
    -- Legacy (backward compatible)
    'brand_asset', 'brand_profile', 'brand_guideline', 'web_page', 'note',
    'idea', 'meeting_note', 'visual_identity', 'verbal_identity',
    'target_audience', 'competitive_positioning', 'product_catalog',
    'brand_logo', 'brand_screenshot'
  ));

-- ── Link label index: any label (typed relationships) ───────────────────────

DROP INDEX IF EXISTS idx_knowledge_links_label;

CREATE INDEX IF NOT EXISTS idx_knowledge_links_label
  ON client_knowledge_links(label);

-- ── Active (non-superseded) entries by client + type ────────────────────────

CREATE INDEX IF NOT EXISTS idx_knowledge_entries_active
  ON client_knowledge_entries(client_id, type)
  WHERE superseded_by IS NULL;

-- ── Current knowledge: optional type filter ───────────────────────────────────

CREATE OR REPLACE FUNCTION get_current_knowledge(
  target_client_id uuid,
  target_types text[] DEFAULT NULL,
  result_limit int DEFAULT 50
)
RETURNS SETOF client_knowledge_entries AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM client_knowledge_entries
  WHERE client_id = target_client_id
    AND superseded_by IS NULL
    AND (valid_until IS NULL OR valid_until > now())
    AND (target_types IS NULL OR type = ANY(target_types))
  ORDER BY valid_from DESC NULLS LAST, created_at DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Knowledge history for a text topic (temporal + supersession flags) ─────

CREATE OR REPLACE FUNCTION get_knowledge_history(
  target_client_id uuid,
  search_text text,
  result_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  content text,
  valid_from timestamptz,
  valid_until timestamptz,
  superseded_by uuid,
  confidence float,
  created_at timestamptz,
  is_current boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.type,
    e.title,
    e.content,
    e.valid_from,
    e.valid_until,
    e.superseded_by,
    e.confidence,
    e.created_at,
    (e.superseded_by IS NULL AND (e.valid_until IS NULL OR e.valid_until > now())) AS is_current
  FROM client_knowledge_entries e
  WHERE e.client_id = target_client_id
    AND (
      e.title ILIKE '%' || search_text || '%'
      OR e.content ILIKE '%' || search_text || '%'
    )
  ORDER BY e.valid_from DESC NULLS LAST, e.created_at DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_current_knowledge(uuid, text[], int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_knowledge_history(uuid, text, int) TO authenticated, service_role;
