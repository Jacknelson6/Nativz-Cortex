/**
 * TrustGraph native REST API (flow-hosted services).
 *
 * Uses embeddings → document-embeddings (client) and embeddings → graph-embeddings (agency)
 * per TrustGraph API gateway docs.
 *
 * @see https://docs.trustgraph.ai/reference/apis/rest.html
 */

import { postTrustGraphJson } from '@/lib/context/trustgraph-request';
import type { KnowledgeSearchResult } from '@/lib/knowledge/search-types';
import type { KnowledgeNode } from '@/lib/knowledge/graph-queries';

function requireFlowId(): string {
  const id = process.env.TRUSTGRAPH_FLOW_ID?.trim();
  if (!id) {
    throw new Error('TRUSTGRAPH_FLOW_ID is required when TRUSTGRAPH_API_STYLE=native');
  }
  return id;
}

function embeddingVectorsFromResponse(raw: unknown): number[] | null {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const v = rec?.vectors;
  return Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : null;
}

/**
 * Client KB: query text → embeddings → document-embeddings (chunks).
 */
export async function trustGraphNativeClientSearch(params: {
  baseUrl: string;
  apiKey: string | null;
  timeoutMs: number;
  clientId: string;
  query: string;
  limit: number;
  threshold?: number;
  types?: string[];
}): Promise<KnowledgeSearchResult[]> {
  const flowId = requireFlowId();
  const user = process.env.TRUSTGRAPH_USER?.trim() || 'cortex';
  const prefix = process.env.TRUSTGRAPH_CLIENT_COLLECTION_PREFIX?.trim() ?? 'cortex-client-';
  const collection = `${prefix}${params.clientId}`;

  const embedPath = `/api/v1/flow/${encodeURIComponent(flowId)}/service/embeddings`;
  const embRaw = await postTrustGraphJson(
    params.baseUrl,
    embedPath,
    params.apiKey,
    { text: params.query },
    params.timeoutMs,
  );
  const vectors = embeddingVectorsFromResponse(embRaw);
  if (!vectors?.length) return [];

  const docPath = `/api/v1/flow/${encodeURIComponent(flowId)}/service/document-embeddings`;
  const docRaw = await postTrustGraphJson(
    params.baseUrl,
    docPath,
    params.apiKey,
    {
      vectors,
      limit: params.limit,
      user,
      collection,
    },
    params.timeoutMs,
  );

  const docRec = docRaw && typeof docRaw === 'object' ? (docRaw as Record<string, unknown>) : null;
  const chunks = docRec?.chunks;
  if (!Array.isArray(chunks)) return [];

  return chunks.map((c, i) => ({
    id: `trustgraph:chunk:${params.clientId}:${i}`,
    client_id: params.clientId,
    type: 'note',
    title: `Semantic match ${i + 1}`,
    content: typeof c === 'string' ? c : JSON.stringify(c),
    metadata: { source: 'trustgraph', service: 'document-embeddings' },
    score: Math.max(0, 1 - i * 0.02),
  }));
}

type GraphEntity = { v?: string; e?: boolean };

/**
 * Agency graph: query text → embeddings → graph-embeddings (entity IRIs).
 */
export async function trustGraphNativeAgencySearch(params: {
  baseUrl: string;
  apiKey: string | null;
  timeoutMs: number;
  query: string;
  limit: number;
  kinds?: string[];
  domains?: string[];
}): Promise<Array<KnowledgeNode & { similarity: number }>> {
  const flowId = requireFlowId();
  const user = process.env.TRUSTGRAPH_USER?.trim() || 'cortex';
  const collection =
    process.env.TRUSTGRAPH_AGENCY_COLLECTION?.trim() ||
    process.env.TRUSTGRAPH_DEFAULT_COLLECTION?.trim() ||
    'default';

  const embedPath = `/api/v1/flow/${encodeURIComponent(flowId)}/service/embeddings`;
  const embRaw = await postTrustGraphJson(
    params.baseUrl,
    embedPath,
    params.apiKey,
    { text: params.query },
    params.timeoutMs,
  );
  const vectors = embeddingVectorsFromResponse(embRaw);
  if (!vectors?.length) return [];

  const graphPath = `/api/v1/flow/${encodeURIComponent(flowId)}/service/graph-embeddings`;
  const graphRaw = await postTrustGraphJson(
    params.baseUrl,
    graphPath,
    params.apiKey,
    {
      vectors,
      limit: params.limit,
      user,
      collection,
    },
    params.timeoutMs,
  );

  const gr = graphRaw && typeof graphRaw === 'object' ? (graphRaw as Record<string, unknown>) : null;
  const entities = gr?.entities;
  if (!Array.isArray(entities)) return [];

  const now = new Date().toISOString();
  const out: Array<KnowledgeNode & { similarity: number }> = [];

  for (let i = 0; i < entities.length; i++) {
    const row = entities[i] as GraphEntity;
    const uri = typeof row?.v === 'string' ? row.v : '';
    if (!uri) continue;
    const short = uri.split('/').pop() ?? uri;
    out.push({
      id: uri.length > 200 ? `entity:${i}:${short}` : uri,
      kind: 'insight',
      title: short,
      domain: params.domains ?? [],
      tags: params.kinds ?? [],
      connections: [],
      content: uri,
      metadata: { source: 'trustgraph', service: 'graph-embeddings' },
      client_id: null,
      source_repo: null,
      source_path: null,
      source_sha: null,
      sync_status: 'external',
      created_at: now,
      updated_at: now,
      created_by: null,
      similarity: Math.max(0, 1 - i * 0.05),
    });
  }

  return out;
}
