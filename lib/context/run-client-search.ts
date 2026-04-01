/**
 * Client knowledge retrieval orchestration: Supabase + optional TrustGraph (shadow/primary).
 */

import { getContextPlatformConfig, scopeIncludesClient } from '@/lib/context/config';
import { isCircuitOpen, recordFailure, recordSuccess } from '@/lib/context/circuit-breaker';
import { overlapAtK } from '@/lib/context/parity';
import { logContextParity, logContextPlatformError } from '@/lib/context/telemetry';
import { CB_KEY_CLIENT, trustGraphClientSearch } from '@/lib/context/trustgraph-http';
import type { KnowledgeSearchResult } from '@/lib/knowledge/search-types';

export async function runClientSearch(
  clientId: string,
  query: string,
  options: { limit?: number; threshold?: number; types?: string[] },
  supabaseSearch: () => Promise<KnowledgeSearchResult[]>,
): Promise<KnowledgeSearchResult[]> {
  const cfg = getContextPlatformConfig();
  const { limit = 5, threshold = 0.3, types } = options;

  if (cfg.mode === 'off' || !cfg.baseUrl || !scopeIncludesClient(cfg.scope)) {
    return supabaseSearch();
  }

  if (cfg.mode === 'shadow') {
    const t0 = Date.now();
    const primary = await supabaseSearch();
    const primaryMs = Date.now() - t0;
    const tg0 = Date.now();
    try {
      const shadow = await trustGraphClientSearch({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        timeoutMs: cfg.timeoutMs,
        clientId,
        query,
        limit,
        threshold,
        types,
      });
      const trustgraphMs = Date.now() - tg0;
      const primaryIds = primary.map((r) => r.id);
      const trustgraphIds = shadow.map((r) => r.id);
      logContextParity({
        surface: 'client',
        clientId,
        query,
        primaryIds,
        trustgraphIds,
        overlapAt5: overlapAtK(primaryIds, trustgraphIds, 5),
        overlapAt10: overlapAtK(primaryIds, trustgraphIds, 10),
        primaryMs,
        trustgraphMs,
      });
    } catch (e) {
      logContextPlatformError('client', e instanceof Error ? e.message : String(e), { clientId });
      logContextParity({
        surface: 'client',
        clientId,
        query,
        primaryIds: primary.map((r) => r.id),
        trustgraphIds: [],
        overlapAt5: 0,
        overlapAt10: 0,
        primaryMs,
        trustgraphMs: Date.now() - tg0,
        trustgraphError: e instanceof Error ? e.message : String(e),
      });
    }
    return primary;
  }

  if (cfg.mode === 'primary') {
    if (isCircuitOpen(CB_KEY_CLIENT)) {
      return supabaseSearch();
    }
    try {
      const tg = await trustGraphClientSearch({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        timeoutMs: cfg.timeoutMs,
        clientId,
        query,
        limit,
        threshold,
        types,
      });
      recordSuccess(CB_KEY_CLIENT);
      if (tg.length > 0) return tg;
    } catch (e) {
      recordFailure(CB_KEY_CLIENT, cfg.circuitFailureThreshold, cfg.circuitOpenMs);
      logContextPlatformError('client', e instanceof Error ? e.message : String(e), { clientId, fallback: 'supabase' });
    }
    return supabaseSearch();
  }

  return supabaseSearch();
}
