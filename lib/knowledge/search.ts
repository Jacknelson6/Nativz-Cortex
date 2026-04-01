/**
 * Semantic search over the client knowledge base.
 *
 * QMD pattern: agents call searchKnowledge() to retrieve only the most
 * relevant entries instead of loading the entire knowledge corpus.
 * This keeps agent context windows lean regardless of how many entries exist.
 *
 * When TrustGraph is configured (see docs/trustgraph-context-layer.md), retrieval
 * is orchestrated via {@link @/lib/context/run-client-search}.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { generateEmbedding } from '@/lib/ai/embeddings';
import { classifyKnowledgeQuery, type KnowledgeQueryIntent } from './query-classifier';
import { runClientSearch } from '@/lib/context/run-client-search';
import { searchKnowledgeSupabase } from '@/lib/knowledge/search-supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { KnowledgeSearchResult } from './search-types';

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
): Promise<import('./search-types').KnowledgeSearchResult[]> {
  return runClientSearch(clientId, query, options, () =>
    searchKnowledgeSupabase(clientId, query, options),
  );
}

/**
 * Full-text search over a client's knowledge base.
 * Uses Postgres websearch_to_tsquery for natural language queries.
 */
export { searchKnowledgeFTS } from '@/lib/knowledge/search-supabase';

/**
 * Search for current (non-superseded, still-valid) knowledge entries.
 * Filters out entries that have been superseded or expired past their valid_until date.
 * If `asOfDate` is provided, returns knowledge that was current at that point in time.
 */
export async function searchCurrentKnowledge(
  clientId: string,
  query: string,
  options: { limit?: number; threshold?: number; types?: string[]; asOfDate?: string } = {},
): Promise<import('./search-types').KnowledgeSearchResult[]> {
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
 * Classify the query, then run semantic (+ temporal filter when appropriate).
 * Used by Nerd and other agents for intent-aware retrieval.
 */
export async function searchKnowledgeWithIntent(
  clientId: string,
  query: string,
  options: { limit?: number; threshold?: number } = {},
): Promise<{
  results: import('./search-types').KnowledgeSearchResult[];
  intent: KnowledgeQueryIntent;
  preferCurrentOnly: boolean;
}> {
  const { limit = 8, threshold = 0.3 } = options;
  const classification = classifyKnowledgeQuery(query);

  const results = classification.preferCurrentOnly
    ? await searchCurrentKnowledge(clientId, query, {
        limit,
        threshold,
        types: classification.types,
      })
    : await searchKnowledge(clientId, query, {
        limit,
        threshold,
        types: classification.types,
      });

  return {
    results,
    intent: classification.intent,
    preferCurrentOnly: classification.preferCurrentOnly,
  };
}

/**
 * Global semantic search across all clients.
 * Useful for cross-client pattern discovery.
 */
export async function searchKnowledgeGlobal(
  query: string,
  options: { limit?: number; threshold?: number } = {},
): Promise<import('./search-types').KnowledgeSearchResult[]> {
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

  return (data ?? []) as import('./search-types').KnowledgeSearchResult[];
}
