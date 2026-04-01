/**
 * CRUD + search for the `knowledge_nodes` table.
 *
 * This is the agency knowledge graph — merged AC KG + Nativz vault content.
 * Separate from `client_knowledge_entries` which handles per-client knowledge.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { generateEmbedding } from '@/lib/ai/embeddings';
import { runAgencySearch } from '@/lib/context/run-agency-search';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnowledgeNode {
  id: string; // "kind:slug"
  kind: string;
  title: string;
  domain: string[];
  tags: string[];
  connections: string[];
  content: string;
  metadata: Record<string, unknown>;
  client_id: string | null;
  source_repo: string | null;
  source_path: string | null;
  source_sha: string | null;
  sync_status: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Allowed node kinds in the knowledge graph.
 * Old kinds (skill, pattern, methodology, template, sop, moc, agent, etc.)
 * are deprecated — consolidate into playbooks instead.
 */
export const ALLOWED_NODE_KINDS = ['domain', 'playbook', 'client', 'meeting', 'asset', 'insight'] as const;
export type KnowledgeNodeKind = (typeof ALLOWED_NODE_KINDS)[number];

/** Slugify a title for use in node IDs. Consistent across all code paths. */
export function slugifyNodeId(kind: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 80);
  return `${kind}:${slug}`;
}

// ---------------------------------------------------------------------------
// List nodes with filters
// ---------------------------------------------------------------------------

export async function getKnowledgeNodes(filters?: {
  clientId?: string | null; // null = agency-only, undefined = all
  kind?: string | string[];
  domain?: string[];
  search?: string; // full-text search
  limit?: number;
  offset?: number;
}): Promise<KnowledgeNode[]> {
  const { clientId, kind, domain, search, limit = 100, offset = 0 } = filters ?? {};

  // If search is provided, use the FTS RPC
  if (search) {
    return searchKnowledgeNodesFTS(search, { clientId, kinds: Array.isArray(kind) ? kind : kind ? [kind] : undefined, limit });
  }

  const admin = createAdminClient();
  let query = admin
    .from('knowledge_nodes')
    .select('*')
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // clientId: null = agency-only (client_id IS NULL), undefined = all, string = specific client
  if (clientId === null) {
    query = query.is('client_id', null);
  } else if (clientId !== undefined) {
    query = query.eq('client_id', clientId);
  }

  if (kind) {
    const kinds = Array.isArray(kind) ? kind : [kind];
    query = query.in('kind', kinds);
  }

  if (domain && domain.length > 0) {
    query = query.overlaps('domain', domain);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch knowledge nodes: ${error.message}`);
  return (data ?? []) as KnowledgeNode[];
}

// ---------------------------------------------------------------------------
// Get single node
// ---------------------------------------------------------------------------

export async function getKnowledgeNode(id: string): Promise<KnowledgeNode | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('knowledge_nodes')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch knowledge node: ${error.message}`);
  return (data as KnowledgeNode) ?? null;
}

// ---------------------------------------------------------------------------
// Get graph data (lightweight — no content)
// ---------------------------------------------------------------------------

export async function getKnowledgeGraphData(filters?: {
  clientId?: string | null;
  kind?: string | string[];
  domain?: string[];
  limit?: number;
}): Promise<{
  nodes: Array<
    Pick<KnowledgeNode, 'id' | 'kind' | 'title' | 'domain' | 'tags' | 'connections' | 'client_id'>
  >;
}> {
  const { clientId, kind, domain, limit = 500 } = filters ?? {};
  const admin = createAdminClient();

  let query = admin
    .from('knowledge_nodes')
    .select('id, kind, title, domain, tags, connections, client_id')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (clientId === null) {
    query = query.is('client_id', null);
  } else if (clientId !== undefined) {
    query = query.eq('client_id', clientId);
  }

  if (kind) {
    const kinds = Array.isArray(kind) ? kind : [kind];
    query = query.in('kind', kinds);
  }

  if (domain && domain.length > 0) {
    query = query.overlaps('domain', domain);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch knowledge graph data: ${error.message}`);
  return { nodes: (data ?? []) as Array<Pick<KnowledgeNode, 'id' | 'kind' | 'title' | 'domain' | 'tags' | 'connections' | 'client_id'>> };
}

// ---------------------------------------------------------------------------
// Semantic search
// ---------------------------------------------------------------------------

export async function searchKnowledgeNodes(
  query: string,
  options?: {
    clientId?: string | null;
    kinds?: string[];
    domains?: string[];
    limit?: number;
  },
): Promise<Array<KnowledgeNode & { similarity: number }>> {
  const { clientId, kinds, domains, limit = 10 } = options ?? {};

  return runAgencySearch(
    query,
    { clientId, kinds, domains, limit },
    async () => searchKnowledgeNodesFromSupabase(query, { clientId, kinds, domains, limit }),
  );
}

async function searchKnowledgeNodesFromSupabase(
  query: string,
  options: {
    clientId?: string | null;
    kinds?: string[];
    domains?: string[];
    limit: number;
  },
): Promise<Array<KnowledgeNode & { similarity: number }>> {
  const { clientId, kinds, domains, limit } = options;

  const embedding = await generateEmbedding(query);

  if (embedding) {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('search_knowledge_nodes', {
      query_embedding: JSON.stringify(embedding),
      target_client_id: clientId ?? null,
      target_kinds: kinds ?? null,
      target_domains: domains ?? null,
      match_limit: limit,
      similarity_threshold: 0.3,
    });

    if (!error && data && data.length > 0) {
      return data as Array<KnowledgeNode & { similarity: number }>;
    }
  }

  const ftsResults = await searchKnowledgeNodesFTS(query, { clientId, kinds, limit });
  return ftsResults.map((r) => ({ ...r, similarity: 0 }));
}

// ---------------------------------------------------------------------------
// Full-text search (internal helper)
// ---------------------------------------------------------------------------

async function searchKnowledgeNodesFTS(
  query: string,
  options?: {
    clientId?: string | null;
    kinds?: string[];
    limit?: number;
  },
): Promise<KnowledgeNode[]> {
  const { clientId, kinds, limit = 20 } = options ?? {};
  const admin = createAdminClient();

  const { data, error } = await admin.rpc('search_knowledge_nodes_fts', {
    query_text: query,
    target_client_id: clientId ?? null,
    target_kinds: kinds ?? null,
    match_limit: limit,
  });

  if (error) {
    console.error('Knowledge nodes FTS error:', error);
    return [];
  }

  return (data ?? []) as KnowledgeNode[];
}

// ---------------------------------------------------------------------------
// Create node
// ---------------------------------------------------------------------------

export async function createKnowledgeNode(
  node: Omit<KnowledgeNode, 'created_at' | 'updated_at' | 'sync_status' | 'source_sha'>,
): Promise<KnowledgeNode> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('knowledge_nodes')
    .insert({
      ...node,
      sync_status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create knowledge node: ${error.message}`);

  // Auto-embed for semantic search (non-blocking)
  embedKnowledgeNode(data.id).catch(() => {});

  return data as KnowledgeNode;
}

// ---------------------------------------------------------------------------
// Update node
// ---------------------------------------------------------------------------

export async function updateKnowledgeNode(
  id: string,
  updates: Partial<Pick<KnowledgeNode, 'title' | 'content' | 'domain' | 'tags' | 'connections' | 'metadata'>>,
): Promise<KnowledgeNode> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('knowledge_nodes')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
      sync_status: 'pending',
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update knowledge node: ${error.message}`);

  // Re-embed if content or title changed (non-blocking)
  if (updates.title || updates.content) {
    embedKnowledgeNode(data.id).catch(() => {});
  }

  return data as KnowledgeNode;
}

// ---------------------------------------------------------------------------
// Delete node
// ---------------------------------------------------------------------------

export async function deleteKnowledgeNode(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('knowledge_nodes')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete knowledge node: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Get node counts by kind (for sidebar)
// ---------------------------------------------------------------------------

export async function getKnowledgeNodeCounts(
  clientId?: string | null,
): Promise<Record<string, number>> {
  const admin = createAdminClient();

  let query = admin
    .from('knowledge_nodes')
    .select('kind');

  if (clientId === null) {
    query = query.is('client_id', null);
  } else if (clientId !== undefined) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch knowledge node counts: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const kind = row.kind as string;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Embedding helper (internal)
// ---------------------------------------------------------------------------

async function embedKnowledgeNode(nodeId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: node, error } = await admin
    .from('knowledge_nodes')
    .select('id, title, content')
    .eq('id', nodeId)
    .single();

  if (error || !node) return false;

  const text = `${node.title}\n\n${(node.content ?? '').slice(0, 2000)}`;
  const embedding = await generateEmbedding(text);
  if (!embedding) return false;

  const { error: updateError } = await admin
    .from('knowledge_nodes')
    .update({ embedding: JSON.stringify(embedding) })
    .eq('id', nodeId);

  return !updateError;
}
