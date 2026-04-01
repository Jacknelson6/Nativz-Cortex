# TrustGraph context layer

This app’s **client knowledge** (`client_knowledge_entries`) and **agency knowledge** (`knowledge_nodes`) retrieval runs through Supabase by default. Optional integration with [TrustGraph](https://github.com/trustgraph-ai/trustgraph) adds a parallel **shadow** or **primary** retrieval path with parity logging and circuit-breaker fallback.

## Code map

| Area | Location |
|------|----------|
| Config | [`lib/context/config.ts`](../lib/context/config.ts) |
| Client orchestration | [`lib/context/run-client-search.ts`](../lib/context/run-client-search.ts) |
| Agency orchestration | [`lib/context/run-agency-search.ts`](../lib/context/run-agency-search.ts) |
| TrustGraph HTTP + response mapping | [`lib/context/trustgraph-http.ts`](../lib/context/trustgraph-http.ts) |
| Parity metrics | [`lib/context/parity.ts`](../lib/context/parity.ts) |
| Structured logs | [`lib/context/telemetry.ts`](../lib/context/telemetry.ts) |
| Client search entry | [`lib/knowledge/search.ts`](../lib/knowledge/search.ts) → `searchKnowledge` |
| Agency search entry | [`lib/knowledge/graph-queries.ts`](../lib/knowledge/graph-queries.ts) → `searchKnowledgeNodes` |

Nerd tools [`search_knowledge_base`](../lib/nerd/tools/knowledge.ts) and [`search_agency_knowledge`](../lib/nerd/tools/agency-knowledge.ts) use those functions unchanged.

## Environment variables

| Variable | Description |
|----------|-------------|
| `CONTEXT_PLATFORM_MODE` | `off` (default), `shadow`, or `primary` |
| `CONTEXT_PLATFORM_SCOPE` | `client`, `agency`, or `both` (default) |
| `TRUSTGRAPH_BASE_URL` | Gateway base URL, no trailing slash (required when mode is not `off`) |
| `TRUSTGRAPH_API_KEY` | Optional `Authorization: Bearer` value (matches TrustGraph `GATEWAY_SECRET` when set) |
| `TRUSTGRAPH_API_STYLE` | `cortex` (default): POST to custom paths below. `native`: call TrustGraph flow services (`embeddings` → `document-embeddings` / `graph-embeddings`) per [REST docs](https://docs.trustgraph.ai/reference/apis/rest.html). |
| `TRUSTGRAPH_FLOW_ID` | Required when `TRUSTGRAPH_API_STYLE=native` — running flow instance id |
| `TRUSTGRAPH_USER` | Multi-tenant `user` field for native API (default `cortex`) |
| `TRUSTGRAPH_CLIENT_COLLECTION_PREFIX` | Native client collection prefix: `{prefix}{client_id}` (default `cortex-client-`) |
| `TRUSTGRAPH_AGENCY_COLLECTION` | Native `collection` for graph-embeddings (default `default`, or set `TRUSTGRAPH_DEFAULT_COLLECTION`) |
| `TRUSTGRAPH_CLIENT_SEARCH_PATH` | POST path when `TRUSTGRAPH_API_STYLE=cortex` (default `/api/v1/cortex/client-search`) |
| `TRUSTGRAPH_AGENCY_SEARCH_PATH` | POST path when `TRUSTGRAPH_API_STYLE=cortex` (default `/api/v1/cortex/agency-search`) |
| `TRUSTGRAPH_TIMEOUT_MS` | HTTP timeout (default `12000`) |
| `TRUSTGRAPH_CIRCUIT_FAILURES` | Failures before circuit opens in `primary` mode (default `5`) |
| `TRUSTGRAPH_CIRCUIT_OPEN_MS` | Circuit open duration (default `60000`) |

### Request body (client)

`POST {TRUSTGRAPH_BASE_URL}{TRUSTGRAPH_CLIENT_SEARCH_PATH}`

JSON body includes: `tenant_id`, `client_id`, `query`, `limit`, `similarity_threshold`, optional `types`.

### Request body (agency)

`POST {TRUSTGRAPH_BASE_URL}{TRUSTGRAPH_AGENCY_SEARCH_PATH}`

JSON body includes: `query`, `limit`, optional `kinds`, `domains`.

### Response shape

The mapper accepts arrays under `hits`, `results`, `data`, `documents`, `items`, or `chunks`. Each item should include at least `id`; optional `title`, `content` / `text`, `score` / `similarity`, `type` / `kind`, `metadata`.

Align your gateway with [TrustGraph REST docs](https://docs.trustgraph.ai/reference/apis/rest.html) or proxy into the default paths above.

### Native API (`TRUSTGRAPH_API_STYLE=native`)

- **Client:** `POST /api/v1/flow/{flow}/service/embeddings` with `{ "text": "<query>" }`, then `POST .../document-embeddings` with `vectors`, `limit`, `user`, `collection` (collection = `TRUSTGRAPH_CLIENT_COLLECTION_PREFIX` + `client_id`). Response `chunks` are mapped to `KnowledgeSearchResult`.
- **Agency:** same embedding step, then `POST .../graph-embeddings` with the same shape; response `entities` (RDF URIs) are mapped to `KnowledgeNode`.

You must ingest documents into the matching **collection** in TrustGraph for client search to return chunks; agency search needs graph embeddings in the **agency collection**.

## Smoke test

From the repo root (loads `.env.local` if you use `dotenv` — run with env vars set):

```bash
TRUSTGRAPH_BASE_URL=http://127.0.0.1:8080 TRUSTGRAPH_API_STYLE=native TRUSTGRAPH_FLOW_ID=<flow> \
TRUSTGRAPH_API_KEY=<optional> TRUSTGRAPH_SMOKE_CLIENT_ID=<uuid> npm run trustgraph:smoke
```

## Modes

- **off**: Supabase only; no TrustGraph calls.
- **shadow**: Supabase results are returned; TrustGraph runs in parallel and emits parity JSON logs (`event: context_platform_parity`).
- **primary**: TrustGraph is tried first; empty or failed calls fall back to Supabase. Failures increment a per-process circuit breaker; when open, Supabase is used until the open window expires.

## Staged cutover (rollback gates)

1. **Local/staging**: set `CONTEXT_PLATFORM_MODE=shadow`, `TRUSTGRAPH_BASE_URL` to your gateway, verify logs and overlap metrics.
2. **Production shadow**: same env; monitor latency and `overlapAt5` / `overlapAt10` in logs.
3. **Primary (client only)**: `CONTEXT_PLATFORM_MODE=primary`, `CONTEXT_PLATFORM_SCOPE=client`; watch error rate and circuit trips.
4. **Primary (agency)**: extend scope to `both` or `agency` after client primary is stable.
5. **Rollback**: set `CONTEXT_PLATFORM_MODE=off` or remove `TRUSTGRAPH_BASE_URL`; behavior reverts to Supabase only.

## Related

- TrustGraph: [trustgraph-ai/trustgraph](https://github.com/trustgraph-ai/trustgraph)
