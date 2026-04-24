// lib/research/history.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/** Initial batch size for topic search hub history (`/admin/finder/new`). */
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

export interface FetchHistoryOptions {
  limit?: number;
  type?: HistoryItemType | null;
  clientId?: string | null;
  cursor?: string | null;
  /** When `type` is omitted, set false to return only topic searches (no idea generations). Ignored when `type` is set. */
  includeIdeas?: boolean;
  /**
   * When set, only searches / ideas whose `client_id` belongs to this org are returned.
   * Omit or pass `null` for admin-wide history (internal dashboards).
   *
   * NOTE: multi-brand orgs (one organization_id → multiple active clients)
   * broaden beyond a single brand. Prefer `allowedClientIds` for strict
   * isolation — pass it to scope to exact brands the caller is authorized
   * for.
   */
  organizationId?: string | null;
  /**
   * Strict allowlist of client_ids the caller is authorized to see. When
   * provided, overrides `organizationId` resolution. A caller-supplied
   * `clientId` must be in this set or the call returns empty. This is the
   * correct option for portal viewers + admins impersonating — anywhere
   * the "same org, different brand" leak risk applies.
   */
  allowedClientIds?: string[] | null;
}

/**
 * Resolve client_id filters for topic_searches and idea_generations when scoping by org.
 */
async function resolveClientIdsForHistoryScope(
  supabase: SupabaseClient,
  organizationId: string | null | undefined,
  clientId: string | null,
): Promise<{ clientIds: string[] | null; empty: boolean }> {
  if (!organizationId) {
    if (clientId) return { clientIds: [clientId], empty: false };
    return { clientIds: null, empty: false };
  }

  const { data: orgClients } = await supabase
    .from('clients')
    .select('id')
    .eq('organization_id', organizationId);

  let ids = (orgClients ?? []).map((c) => c.id as string);

  if (clientId) {
    if (!ids.includes(clientId)) return { clientIds: null, empty: true };
    return { clientIds: [clientId], empty: false };
  }

  if (ids.length === 0) return { clientIds: null, empty: true };
  return { clientIds: ids, empty: false };
}

export async function fetchHistory({
  limit = 10,
  type = null,
  clientId = null,
  cursor = null,
  includeIdeas = true,
  organizationId = null,
  allowedClientIds = null,
}: FetchHistoryOptions = {}): Promise<HistoryItem[]> {
  const supabase = createAdminClient();
  const items: HistoryItem[] = [];

  // Explicit allowlist takes precedence — this is how callers enforce
  // brand-level isolation inside multi-brand orgs.
  let scope: { clientIds: string[] | null; empty: boolean };
  if (allowedClientIds) {
    if (allowedClientIds.length === 0) {
      scope = { clientIds: null, empty: true };
    } else if (clientId) {
      if (!allowedClientIds.includes(clientId)) {
        scope = { clientIds: null, empty: true };
      } else {
        scope = { clientIds: [clientId], empty: false };
      }
    } else {
      scope = { clientIds: allowedClientIds, empty: false };
    }
  } else {
    scope = await resolveClientIdsForHistoryScope(supabase, organizationId, clientId);
  }
  if (scope.empty) return [];

  const shouldFetchSearches = !type || type === 'brand_intel' || type === 'topic';
  const shouldFetchIdeas = type === 'ideas' || (type === null && includeIdeas);

  const searchesPromise = shouldFetchSearches
    ? (() => {
        let q = supabase
          .from('topic_searches')
          .select('id, query, search_mode, status, created_at, client_id, clients(name)')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (cursor) q = q.lt('created_at', cursor);
        if (scope.clientIds) q = q.in('client_id', scope.clientIds);
        if (type === 'brand_intel') q = q.eq('search_mode', 'client_strategy');
        if (type === 'topic') q = q.eq('search_mode', 'general');
        return q;
      })()
    : null;

  const ideasPromise = shouldFetchIdeas
    ? (() => {
        let q = supabase
          .from('idea_generations')
          .select('id, concept, count, status, created_at, client_id, search_id, clients(name)')
          .gt('count', 1) // Exclude re-roll generations (count=1)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (cursor) q = q.lt('created_at', cursor);
        if (scope.clientIds) q = q.in('client_id', scope.clientIds);
        return q;
      })()
    : null;

  const [searchesRes, ideasRes] = await Promise.all([searchesPromise, ideasPromise]);

  for (const s of searchesRes?.data ?? []) {
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
          ? `/admin/finder/${s.id}/subtopics`
          : s.status === 'processing' || s.status === 'pending'
            ? `/admin/finder/${s.id}/processing`
            : `/admin/finder/${s.id}`,
    });
  }

  if (ideasRes) {
    const generations = ideasRes.data ?? [];
    // Batch-fetch search queries for generations linked to a search.
    const searchIds = generations
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

    for (const g of generations) {
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
        ? `/admin/finder/${s.id}/subtopics`
        : s.status === 'processing' || s.status === 'pending'
          ? `/admin/finder/${s.id}/processing`
          : `/admin/finder/${s.id}`,
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
