-- Ensure all knowledge search RPC functions exist.
-- These were originally created via the Supabase dashboard and may be missing
-- or have mismatched signatures, causing "Failed to query knowledge graph" errors.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Client knowledge: semantic search (embedding cosine similarity)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_knowledge_semantic(
  query_embedding text,
  target_client_id uuid,
  match_limit int DEFAULT 5,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  type text,
  title text,
  content text,
  metadata jsonb,
  score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.client_id,
    e.type,
    e.title,
    e.content,
    e.metadata,
    1 - (e.embedding <=> query_embedding::vector) AS score
  FROM client_knowledge_entries e
  WHERE e.client_id = target_client_id
    AND e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding::vector) >= similarity_threshold
  ORDER BY e.embedding <=> query_embedding::vector
  LIMIT match_limit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Client knowledge: full-text search
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_knowledge_fts(
  query_text text,
  target_client_id uuid,
  match_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  type text,
  title text,
  content text,
  metadata jsonb,
  rank float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tsq tsquery;
BEGIN
  -- Try websearch_to_tsquery first (handles natural language); fall back to plainto_tsquery
  BEGIN
    tsq := websearch_to_tsquery('english', query_text);
  EXCEPTION WHEN OTHERS THEN
    tsq := plainto_tsquery('english', query_text);
  END;

  RETURN QUERY
  SELECT
    e.id,
    e.client_id,
    e.type,
    e.title,
    e.content,
    e.metadata,
    ts_rank(to_tsvector('english', coalesce(e.title, '') || ' ' || coalesce(e.content, '')), tsq) AS rank
  FROM client_knowledge_entries e
  WHERE e.client_id = target_client_id
    AND to_tsvector('english', coalesce(e.title, '') || ' ' || coalesce(e.content, '')) @@ tsq
  ORDER BY rank DESC
  LIMIT match_limit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Client knowledge: global semantic search (cross-client)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_knowledge_global(
  query_embedding text,
  match_limit int DEFAULT 10,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  type text,
  title text,
  content text,
  metadata jsonb,
  score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.client_id,
    e.type,
    e.title,
    e.content,
    e.metadata,
    1 - (e.embedding <=> query_embedding::vector) AS score
  FROM client_knowledge_entries e
  WHERE e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding::vector) >= similarity_threshold
  ORDER BY e.embedding <=> query_embedding::vector
  LIMIT match_limit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Agency knowledge graph: semantic search (knowledge_nodes table)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_knowledge_nodes(
  query_embedding text,
  target_client_id uuid DEFAULT NULL,
  target_kinds text[] DEFAULT NULL,
  target_domains text[] DEFAULT NULL,
  match_limit int DEFAULT 10,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id text,
  kind text,
  title text,
  domain text[],
  tags text[],
  connections text[],
  content text,
  metadata jsonb,
  client_id uuid,
  source_repo text,
  source_path text,
  source_sha text,
  sync_status text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.kind,
    n.title,
    n.domain,
    n.tags,
    n.connections,
    n.content,
    n.metadata,
    n.client_id,
    n.source_repo,
    n.source_path,
    n.source_sha,
    n.sync_status,
    n.created_at,
    n.updated_at,
    n.created_by,
    1 - (n.embedding <=> query_embedding::vector) AS similarity
  FROM knowledge_nodes n
  WHERE n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding::vector) >= similarity_threshold
    AND (target_client_id IS NULL OR n.client_id = target_client_id)
    AND (target_kinds IS NULL OR n.kind = ANY(target_kinds))
    AND (target_domains IS NULL OR n.domain && target_domains)
  ORDER BY n.embedding <=> query_embedding::vector
  LIMIT match_limit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Agency knowledge graph: full-text search
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_knowledge_nodes_fts(
  query_text text,
  target_client_id uuid DEFAULT NULL,
  target_kinds text[] DEFAULT NULL,
  match_limit int DEFAULT 20
)
RETURNS TABLE (
  id text,
  kind text,
  title text,
  domain text[],
  tags text[],
  connections text[],
  content text,
  metadata jsonb,
  client_id uuid,
  source_repo text,
  source_path text,
  source_sha text,
  sync_status text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tsq tsquery;
BEGIN
  BEGIN
    tsq := websearch_to_tsquery('english', query_text);
  EXCEPTION WHEN OTHERS THEN
    tsq := plainto_tsquery('english', query_text);
  END;

  RETURN QUERY
  SELECT
    n.id,
    n.kind,
    n.title,
    n.domain,
    n.tags,
    n.connections,
    n.content,
    n.metadata,
    n.client_id,
    n.source_repo,
    n.source_path,
    n.source_sha,
    n.sync_status,
    n.created_at,
    n.updated_at,
    n.created_by
  FROM knowledge_nodes n
  WHERE to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.content, '')) @@ tsq
    AND (target_client_id IS NULL OR n.client_id = target_client_id)
    AND (target_kinds IS NULL OR n.kind = ANY(target_kinds))
  ORDER BY ts_rank(to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.content, '')), tsq) DESC
  LIMIT match_limit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Grant execute to authenticated users (needed for service role + RLS bypass)
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION search_knowledge_semantic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_knowledge_fts TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_knowledge_global TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_knowledge_nodes TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_knowledge_nodes_fts TO authenticated, service_role;
