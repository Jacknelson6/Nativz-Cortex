/**
 * HTTP client for TrustGraph gateway retrieval.
 *
 * Endpoints and payloads are configurable via env; response parsing accepts common shapes
 * (`hits`, `results`, `data`, `documents`) so deployments can align with TrustGraph REST
 * or a thin proxy in front of it.
 *
 * @see https://github.com/trustgraph-ai/trustgraph
 * @see https://docs.trustgraph.ai/reference/apis/rest.html
 */

import type { KnowledgeSearchResult } from '@/lib/knowledge/search-types';
import type { KnowledgeNode } from '@/lib/knowledge/graph-queries';
import { postTrustGraphJson } from '@/lib/context/trustgraph-request';
import { trustGraphNativeAgencySearch, trustGraphNativeClientSearch } from '@/lib/context/trustgraph-native';

const CB_KEY_CLIENT = 'trustgraph:client';
const CB_KEY_AGENCY = 'trustgraph:agency';

export { CB_KEY_AGENCY, CB_KEY_CLIENT };

function isNativeTrustGraphApi(): boolean {
  return process.env.TRUSTGRAPH_API_STYLE?.trim().toLowerCase() === 'native';
}

function clientPath(): string {
  return process.env.TRUSTGRAPH_CLIENT_SEARCH_PATH?.trim() || '/api/v1/cortex/client-search';
}

function agencyPath(): string {
  return process.env.TRUSTGRAPH_AGENCY_SEARCH_PATH?.trim() || '/api/v1/cortex/agency-search';
}

function extractArray(payload: unknown): unknown[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const o = payload as Record<string, unknown>;
  const candidates = ['hits', 'results', 'data', 'documents', 'items', 'chunks'];
  for (const k of candidates) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  if (Array.isArray(payload)) return payload;
  return null;
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

export function mapTrustGraphClientHits(
  raw: unknown,
  fallbackClientId: string,
): KnowledgeSearchResult[] {
  const arr = extractArray(raw);
  if (!arr?.length) return [];

  const out: KnowledgeSearchResult[] = [];
  for (const item of arr) {
    const rec = asRecord(item);
    if (!rec) continue;
    const id = (rec.id ?? rec.entry_id ?? rec.document_id) as string | undefined;
    if (!id) continue;
    const title = String(rec.title ?? rec.name ?? '');
    const content = String(rec.content ?? rec.text ?? rec.body ?? '');
    const score = typeof rec.score === 'number' ? rec.score : typeof rec.similarity === 'number' ? rec.similarity : 0;
    const type = String(rec.type ?? rec.kind ?? 'note');
    const clientId = String(rec.client_id ?? rec.tenant_id ?? fallbackClientId);
    const metadata = (asRecord(rec.metadata) ?? {}) as Record<string, unknown>;
    out.push({
      id,
      client_id: clientId,
      type,
      title,
      content,
      metadata,
      score,
    });
  }
  return out;
}

export function mapTrustGraphAgencyHits(raw: unknown): Array<KnowledgeNode & { similarity: number }> {
  const arr = extractArray(raw);
  if (!arr?.length) return [];

  const out: Array<KnowledgeNode & { similarity: number }> = [];
  for (const item of arr) {
    const rec = asRecord(item);
    if (!rec) continue;
    const id = (rec.id ?? rec.node_id) as string | undefined;
    if (!id) continue;
    const title = String(rec.title ?? rec.name ?? id);
    const kind = String(rec.kind ?? rec.type ?? 'playbook');
    const domain = Array.isArray(rec.domain) ? (rec.domain as string[]) : [];
    const tags = Array.isArray(rec.tags) ? (rec.tags as string[]) : [];
    const connections = Array.isArray(rec.connections) ? (rec.connections as string[]) : [];
    const content = String(rec.content ?? rec.text ?? '');
    const similarity =
      typeof rec.similarity === 'number'
        ? rec.similarity
        : typeof rec.score === 'number'
          ? rec.score
          : 0;
    const now = new Date().toISOString();
    out.push({
      id,
      kind,
      title,
      domain,
      tags,
      connections,
      content,
      metadata: (asRecord(rec.metadata) ?? {}) as Record<string, unknown>,
      client_id: (rec.client_id as string | null | undefined) ?? null,
      source_repo: null,
      source_path: null,
      source_sha: null,
      sync_status: 'external',
      created_at: String(rec.created_at ?? now),
      updated_at: String(rec.updated_at ?? now),
      created_by: null,
      similarity,
    });
  }
  return out;
}

export async function trustGraphClientSearch(params: {
  baseUrl: string;
  apiKey: string | null;
  timeoutMs: number;
  clientId: string;
  query: string;
  limit: number;
  threshold?: number;
  types?: string[];
}): Promise<KnowledgeSearchResult[]> {
  if (isNativeTrustGraphApi()) {
    return trustGraphNativeClientSearch(params);
  }

  const path = clientPath();
  const body: Record<string, unknown> = {
    tenant_id: params.clientId,
    client_id: params.clientId,
    query: params.query,
    limit: params.limit,
    similarity_threshold: params.threshold ?? 0.3,
  };
  if (params.types?.length) body.types = params.types;

  const raw = await postTrustGraphJson(params.baseUrl, path, params.apiKey, body, params.timeoutMs);
  return mapTrustGraphClientHits(raw, params.clientId);
}

export async function trustGraphAgencySearch(params: {
  baseUrl: string;
  apiKey: string | null;
  timeoutMs: number;
  query: string;
  limit: number;
  kinds?: string[];
  domains?: string[];
}): Promise<Array<KnowledgeNode & { similarity: number }>> {
  if (isNativeTrustGraphApi()) {
    return trustGraphNativeAgencySearch(params);
  }

  const path = agencyPath();
  const body: Record<string, unknown> = {
    query: params.query,
    limit: params.limit,
  };
  if (params.kinds?.length) body.kinds = params.kinds;
  if (params.domains?.length) body.domains = params.domains;

  const raw = await postTrustGraphJson(params.baseUrl, path, params.apiKey, body, params.timeoutMs);
  return mapTrustGraphAgencyHits(raw);
}
