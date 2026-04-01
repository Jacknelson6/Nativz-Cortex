/**
 * Agency knowledge graph retrieval orchestration: Supabase + optional TrustGraph.
 */

import { getContextPlatformConfig, scopeIncludesAgency } from '@/lib/context/config';
import { isCircuitOpen, recordFailure, recordSuccess } from '@/lib/context/circuit-breaker';
import { overlapAtK } from '@/lib/context/parity';
import { logContextParity, logContextPlatformError } from '@/lib/context/telemetry';
import { CB_KEY_AGENCY, trustGraphAgencySearch } from '@/lib/context/trustgraph-http';
import type { KnowledgeNode } from '@/lib/knowledge/graph-queries';

export async function runAgencySearch(
  query: string,
  options: {
    clientId?: string | null;
    kinds?: string[];
    domains?: string[];
    limit?: number;
  },
  supabaseSearch: () => Promise<Array<KnowledgeNode & { similarity: number }>>,
): Promise<Array<KnowledgeNode & { similarity: number }>> {
  const cfg = getContextPlatformConfig();
  const limit = options.limit ?? 10;

  if (cfg.mode === 'off' || !cfg.baseUrl || !scopeIncludesAgency(cfg.scope)) {
    return supabaseSearch();
  }

  if (cfg.mode === 'shadow') {
    const t0 = Date.now();
    const primary = await supabaseSearch();
    const primaryMs = Date.now() - t0;
    const tg0 = Date.now();
    try {
      const shadow = await trustGraphAgencySearch({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        timeoutMs: cfg.timeoutMs,
        query,
        limit,
        kinds: options.kinds,
        domains: options.domains,
      });
      const trustgraphMs = Date.now() - tg0;
      const primaryIds = primary.map((r) => r.id);
      const trustgraphIds = shadow.map((r) => r.id);
      logContextParity({
        surface: 'agency',
        query,
        primaryIds,
        trustgraphIds,
        overlapAt5: overlapAtK(primaryIds, trustgraphIds, 5),
        overlapAt10: overlapAtK(primaryIds, trustgraphIds, 10),
        primaryMs,
        trustgraphMs,
      });
    } catch (e) {
      logContextPlatformError('agency', e instanceof Error ? e.message : String(e), {});
      logContextParity({
        surface: 'agency',
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
    if (isCircuitOpen(CB_KEY_AGENCY)) {
      return supabaseSearch();
    }
    try {
      const tg = await trustGraphAgencySearch({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        timeoutMs: cfg.timeoutMs,
        query,
        limit,
        kinds: options.kinds,
        domains: options.domains,
      });
      recordSuccess(CB_KEY_AGENCY);
      if (tg.length > 0) return tg;
    } catch (e) {
      recordFailure(CB_KEY_AGENCY, cfg.circuitFailureThreshold, cfg.circuitOpenMs);
      logContextPlatformError('agency', e instanceof Error ? e.message : String(e), { fallback: 'supabase' });
    }
    return supabaseSearch();
  }

  return supabaseSearch();
}
