/**
 * Shared types for client knowledge search (Supabase semantic + FTS).
 */

export interface KnowledgeSearchResult {
  id: string;
  client_id: string;
  type: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}
