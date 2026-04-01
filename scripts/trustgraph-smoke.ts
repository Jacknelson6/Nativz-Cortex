/**
 * Smoke-test TrustGraph connectivity from Cortex env (native or cortex-shaped API).
 *
 * Usage:
 *   TRUSTGRAPH_BASE_URL=http://localhost:8080 TRUSTGRAPH_API_STYLE=native TRUSTGRAPH_FLOW_ID=my-flow \
 *   TRUSTGRAPH_SMOKE_CLIENT_ID=<uuid> npx tsx scripts/trustgraph-smoke.ts
 *
 * Loads `.env.local` when present (does not override existing env).
 *
 * @see docs/trustgraph-context-layer.md
 */

import { loadEnvLocal } from './load-env-local';
import { trustGraphClientSearch, trustGraphAgencySearch } from '@/lib/context/trustgraph-http';

loadEnvLocal();

async function main() {
  const baseUrl = process.env.TRUSTGRAPH_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    console.error('Set TRUSTGRAPH_BASE_URL');
    process.exit(1);
  }

  const clientId =
    process.env.TRUSTGRAPH_SMOKE_CLIENT_ID?.trim() || '00000000-0000-0000-0000-000000000000';
  const query = process.env.TRUSTGRAPH_SMOKE_QUERY?.trim() || 'brand voice and positioning';

  console.info('TrustGraph smoke', {
    baseUrl,
    style: process.env.TRUSTGRAPH_API_STYLE ?? 'cortex',
    flow: process.env.TRUSTGRAPH_FLOW_ID ?? '(none)',
    clientId,
    query,
  });

  const t0 = Date.now();
  const clientHits = await trustGraphClientSearch({
    baseUrl,
    apiKey: process.env.TRUSTGRAPH_API_KEY?.trim() || null,
    timeoutMs: Number(process.env.TRUSTGRAPH_TIMEOUT_MS) || 15_000,
    clientId,
    query,
    limit: 3,
    threshold: 0.3,
  });
  console.info(`client search ${Date.now() - t0}ms`, { count: clientHits.length, sample: clientHits[0]?.title });

  const t1 = Date.now();
  const agencyHits = await trustGraphAgencySearch({
    baseUrl,
    apiKey: process.env.TRUSTGRAPH_API_KEY?.trim() || null,
    timeoutMs: Number(process.env.TRUSTGRAPH_TIMEOUT_MS) || 15_000,
    query,
    limit: 3,
  });
  console.info(`agency search ${Date.now() - t1}ms`, { count: agencyHits.length, sample: agencyHits[0]?.title });

  console.info('OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
