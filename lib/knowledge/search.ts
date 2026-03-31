/**
 * Semantic search over the client knowledge base.
 *
 * QMD pattern: agents call searchKnowledge() to retrieve only the most
 * relevant entries instead of loading the entire knowledge corpus.
 * This keeps agent context windows lean regardless of how many entries exist.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { generateEmbedding } from '@/lib/ai/embeddings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnowledgeSearchResult {
  id: string;
  client_id: string;
  type: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

// ---------------------------------------------------------------------------
// Search functions
// ---------------------------------------------------------------------------

/**
 * Semantic search scoped to a single client's knowledge base.
 * Returns the top N most relevant entries by cosine similarity.
 * Falls back to full-text search if embedding generation fails.
 */
export async function searchKnowledge(
  clientId: string,
  query: string,
  options: { limit?: number; threshold?: number; types?: string[] } = {},
): Promise<KnowledgeSearchResult[]> {
  const { limit = 5, threshold = 0.3, types } = options;

  // Try semantic search first
  const embedding = await generateEmbedding(query);

  if (embedding) {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('search_knowledge_semantic', {
      query_embedding: JSON.stringify(embedding),
      target_client_id: clientId,
      match_limit: limit,
      similarity_threshold: threshold,
    });

    if (!error && data && data.length > 0) {
      let results = data as KnowledgeSearchResult[];
      if (types?.length) {
        results = results.filter((r) => types.includes(r.type));
      }
      return results;
    }
  }

  // Fallback: full-text search
  return searchKnowledgeFTS(clientId, query, { limit, types });
}

/**
 * Full-text search over a client's knowledge base.
 * Uses Postgres websearch_to_tsquery for natural language queries.
 */
export async function searchKnowledgeFTS(
  clientId: string,
  query: string,
  options: { limit?: number; types?: string[] } = {},
): Promise<KnowledgeSearchResult[]> {
  const { limit = 5, types } = options;
  const admin = createAdminClient();

  const { data, error } = await admin.rpc('search_knowledge_fts', {
    query_text: query,
    target_client_id: clientId,
    match_limit: limit,
  });

  if (error) {
    console.error('Knowledge FTS error:', error);
    return [];
  }

  let results = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    client_id: row.client_id as string,
    type: row.type as string,
    title: row.title as string,
    content: row.content as string,
    metadata: row.metadata as Record<string, unknown>,
    score: row.rank as number,
  }));

  if (types?.length) {
    results = results.filter((r: KnowledgeSearchResult) => types.includes(r.type));
  }

  return results;
}

/**
 * Search for current (non-superseded, still-valid) knowledge entries.
 * Filters out entries that have been superseded or expired past their valid_until date.
 * If `asOfDate` is provided, returns knowledge that was current at that point in time.
 */
export async function searchCurrentKnowledge(
  clientId: string,
  query: string,
  options: { limit?: number; threshold?: number; types?: string[]; asOfDate?: string } = {},
): Promise<KnowledgeSearchResult[]> {
  const { limit = 10, threshold = 0.3, types, asOfDate } = options;

  // Get broader result set to filter from
  const results = await searchKnowledge(clientId, query, {
    limit: limit * 3,
    threshold,
    types,
  });

  if (results.length === 0) return [];

  // Fetch temporal metadata for matched entries
  const admin = createAdminClient();
  const entryIds = results.map((r) => r.id);
  const { data: entries } = await admin
    .from('client_knowledge_entries')
    .select('id, valid_from, valid_until, superseded_by')
    .in('id', entryIds);

  const temporalMap = new Map(
    (entries ?? []).map((e: { id: string; valid_from: string | null; valid_until: string | null; superseded_by: string | null }) => [e.id, e]),
  );

  const referenceDate = asOfDate ? new Date(asOfDate) : new Date();

  const filtered = results.filter((r) => {
    const temporal = temporalMap.get(r.id);
    if (!temporal) return true; // no temporal data — include by default

    // Exclude superseded entries
    if (temporal.superseded_by) return false;

    // Exclude entries that expired before the reference date
    if (temporal.valid_until && new Date(temporal.valid_until) < referenceDate) return false;

    // For asOfDate queries, exclude entries created after the reference date
    if (asOfDate && temporal.valid_from && new Date(temporal.valid_from) > referenceDate) return false;

    return true;
  });

  return filtered.slice(0, limit);
}

/**
 * Global semantic search across all clients.
 * Useful for cross-client pattern discovery.
 */
export async function searchKnowledgeGlobal(
  query: string,
  options: { limit?: number; threshold?: number } = {},
): Promise<KnowledgeSearchResult[]> {
  const { limit = 10, threshold = 0.3 } = options;

  const embedding = await generateEmbedding(query);
  if (!embedding) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('search_knowledge_global', {
    query_embedding: JSON.stringify(embedding),
    match_limit: limit,
    similarity_threshold: threshold,
  });

  if (error) {
    console.error('Global knowledge search error:', error);
    return [];
  }

  return (data ?? []) as KnowledgeSearchResult[];
}
