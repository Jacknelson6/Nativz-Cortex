/**
 * Temporal-aware knowledge retrieval via Supabase RPCs.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { KnowledgeEntry } from './types';

export interface KnowledgeHistoryRow {
  id: string;
  type: string;
  title: string;
  content: string;
  valid_from: string | null;
  valid_until: string | null;
  superseded_by: string | null;
  confidence: number | null;
  created_at: string;
  is_current: boolean;
}

/**
 * Topic-scoped history across validity and supersession (SQL ILIKE on title/content).
 */
export async function fetchKnowledgeHistory(
  clientId: string,
  searchText: string,
  limit = 20,
): Promise<KnowledgeHistoryRow[]> {
  if (!searchText.trim()) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('get_knowledge_history', {
    target_client_id: clientId,
    search_text: searchText.trim(),
    result_limit: limit,
  });

  if (error) {
    console.error('[temporal-search] get_knowledge_history:', error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    content: row.content as string,
    valid_from: (row.valid_from as string) ?? null,
    valid_until: (row.valid_until as string) ?? null,
    superseded_by: (row.superseded_by as string) ?? null,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    created_at: row.created_at as string,
    is_current: Boolean(row.is_current),
  }));
}

/**
 * Rows that are current per DB rules (non-superseded, inside validity window).
 */
export async function fetchCurrentKnowledgeEntries(
  clientId: string,
  options: { types?: string[]; limit?: number } = {},
): Promise<KnowledgeEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('get_current_knowledge', {
    target_client_id: clientId,
    target_types: options.types?.length ? options.types : null,
    result_limit: options.limit ?? 50,
  });

  if (error) {
    console.error('[temporal-search] get_current_knowledge:', error.message);
    return [];
  }

  return (data ?? []) as KnowledgeEntry[];
}
