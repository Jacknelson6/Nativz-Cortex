// lib/research/history.ts
import { createAdminClient } from '@/lib/supabase/admin';

/** Initial batch size for topic search hub history (`/admin/search/new`). */
export const TOPIC_SEARCH_HUB_HISTORY_LIMIT = 40;

export type HistoryItemType = 'brand_intel' | 'topic' | 'ideas';

export interface HistoryItem {
  id: string;
  type: HistoryItemType;
  title: string;
  status: string;
  clientName: string | null;
  clientId: string | null;
  createdAt: string;
  href: string;
}

interface FetchHistoryOptions {
  limit?: number;
  type?: HistoryItemType | null;
  clientId?: string | null;
  cursor?: string | null;
  /** When `type` is omitted, set false to return only topic searches (no idea generations). Ignored when `type` is set. */
  includeIdeas?: boolean;
}

export async function fetchHistory({
  limit = 10,
  type = null,
  clientId = null,
  cursor = null,
  includeIdeas = true,
}: FetchHistoryOptions = {}): Promise<HistoryItem[]> {
  const supabase = createAdminClient();
  const items: HistoryItem[] = [];

  if (!type || type === 'brand_intel' || type === 'topic') {
    let query = supabase
      .from('topic_searches')
      .select('id, query, search_mode, status, created_at, client_id, clients(name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cursor) query = query.lt('created_at', cursor);
    if (clientId) query = query.eq('client_id', clientId);
    if (type === 'brand_intel') query = query.eq('search_mode', 'client_strategy');
    if (type === 'topic') query = query.eq('search_mode', 'general');

    const { data: searches } = await query;

    for (const s of searches ?? []) {
      const client = Array.isArray(s.clients) ? s.clients[0] : s.clients;
      items.push({
        id: s.id,
        type: s.search_mode === 'client_strategy' ? 'brand_intel' : 'topic',
        title: s.query,
        status: s.status,
        clientName: (client as { name: string } | null)?.name ?? null,
        clientId: s.client_id,
        createdAt: s.created_at,
        href:
          s.status === 'pending_subtopics'
            ? `/admin/search/${s.id}/subtopics`
            : s.status === 'processing' || s.status === 'pending'
              ? `/admin/search/${s.id}/processing`
              : `/admin/search/${s.id}`,
      });
    }
  }

  const shouldFetchIdeas = type === 'ideas' || (type === null && includeIdeas);

  if (shouldFetchIdeas) {
    let query = supabase
      .from('idea_generations')
      .select('id, concept, count, status, created_at, client_id, search_id, clients(name)')
      .gt('count', 1) // Exclude re-roll generations (count=1)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cursor) query = query.lt('created_at', cursor);
    if (clientId) query = query.eq('client_id', clientId);

    const { data: generations } = await query;

    // Batch-fetch search queries for generations linked to a search
    const searchIds = (generations ?? [])
      .map((g) => g.search_id)
      .filter((id): id is string => !!id);
    const searchQueryMap: Record<string, string> = {};
    if (searchIds.length > 0) {
      const { data: searches } = await supabase
        .from('topic_searches')
        .select('id, query')
        .in('id', searchIds);
      for (const s of searches ?? []) {
        searchQueryMap[s.id] = s.query;
      }
    }

    for (const g of generations ?? []) {
      const client = Array.isArray(g.clients) ? g.clients[0] : g.clients;
      const count = g.count ?? 10;
      const concept = g.concept ?? 'video';
      const searchQuery = g.search_id ? searchQueryMap[g.search_id] : null;
      const title = `${count} ${concept} ideas${searchQuery ? ` from ${searchQuery} research` : ''}`;
      items.push({
        id: g.id,
        type: 'ideas',
        title,
        status: g.status,
        clientName: (client as { name: string } | null)?.name ?? null,
        clientId: g.client_id,
        createdAt: g.created_at,
        href: `/admin/ideas/${g.id}`,
      });
    }
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items.slice(0, limit);
}

type TopicSearchRow = {
  id: string;
  query: string;
  search_mode: string;
  status: string;
  created_at: string;
  client_id: string | null;
  clients: { name: string } | { name: string }[] | null;
};

/** Map a `topic_searches` row to `HistoryItem` (topic / brand_intel). */
export function topicSearchRowToHistoryItem(s: TopicSearchRow): HistoryItem {
  const client = Array.isArray(s.clients) ? s.clients[0] : s.clients;
  return {
    id: s.id,
    type: s.search_mode === 'client_strategy' ? 'brand_intel' : 'topic',
    title: s.query,
    status: s.status,
    clientName: (client as { name: string } | null)?.name ?? null,
    clientId: s.client_id,
    createdAt: s.created_at,
    href:
      s.status === 'pending_subtopics'
        ? `/admin/search/${s.id}/subtopics`
        : s.status === 'processing' || s.status === 'pending'
          ? `/admin/search/${s.id}/processing`
          : `/admin/search/${s.id}`,
  };
}

/** Load topic-search `HistoryItem`s by id (order preserved). Used for folder contents. */
export async function fetchTopicSearchHistoryItemsByIds(ids: string[]): Promise<HistoryItem[]> {
  if (ids.length === 0) return [];
  const supabase = createAdminClient();
  const { data: searches } = await supabase
    .from('topic_searches')
    .select('id, query, search_mode, status, created_at, client_id, clients(name)')
    .in('id', ids);
  const byId = new Map<string, TopicSearchRow>();
  for (const s of searches ?? []) {
    byId.set(s.id, s as TopicSearchRow);
  }
  const out: HistoryItem[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) out.push(topicSearchRowToHistoryItem(row));
  }
  return out;
}
