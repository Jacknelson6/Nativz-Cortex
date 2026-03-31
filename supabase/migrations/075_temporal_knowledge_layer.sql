-- 075: Temporal Knowledge Layer
-- Adds temporal reasoning columns and indexes to client_knowledge_entries,
-- enabling supersession chains, validity windows, and time-scoped queries.

-- ── Temporal columns on knowledge entries ────────────────────────────────────

ALTER TABLE client_knowledge_entries
  ADD COLUMN IF NOT EXISTS valid_from timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_until timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES client_knowledge_entries(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence float DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS temporal_markers jsonb DEFAULT NULL;

-- ── Indexes for temporal queries ─────────────────────────────────────────────

-- Fast lookup of entries within a validity window for a client
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_temporal
  ON client_knowledge_entries(client_id, valid_from, valid_until)
  WHERE valid_until IS NOT NULL;

-- Fast lookup of superseded entries
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_superseded
  ON client_knowledge_entries(superseded_by)
  WHERE superseded_by IS NOT NULL;

-- Fast lookup of temporal/semantic link labels
CREATE INDEX IF NOT EXISTS idx_knowledge_links_label
  ON client_knowledge_links(label)
  WHERE label IN ('supersedes', 'contradicts', 'references');

-- ── RPC: get current (non-superseded) knowledge for a client ─────────────────

CREATE OR REPLACE FUNCTION get_current_knowledge(
  target_client_id uuid,
  search_query text,
  result_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  content text,
  metadata jsonb,
  valid_from timestamptz,
  valid_until timestamptz,
  confidence float,
  superseded_by uuid,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.type, e.title, e.content, e.metadata,
    e.valid_from, e.valid_until, e.confidence, e.superseded_by,
    e.created_at
  FROM client_knowledge_entries e
  WHERE e.client_id = target_client_id
    AND e.superseded_by IS NULL
    AND (e.valid_until IS NULL OR e.valid_until > now())
  ORDER BY e.valid_from DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
