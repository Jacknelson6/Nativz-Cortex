/**
 * Supabase-only client knowledge search (semantic + FTS fallback).
 * Used by the context platform orchestrator and {@link ./search}.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { generateEmbedding } from '@/lib/ai/embeddings';
import type { KnowledgeSearchResult } from './search-types';

/**
 * Semantic search scoped to a single client's knowledge base (Supabase RPCs only).
 */
export async function searchKnowledgeSupabase(
  clientId: string,
  query: string,
  options: { limit?: number; threshold?: number; types?: string[] } = {},
): Promise<KnowledgeSearchResult[]> {
  const { limit = 5, threshold = 0.3, types } = options;

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

  return searchKnowledgeFTS(clientId, query, { limit, types });
}

/**
 * Full-text search over a client's knowledge base.
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
