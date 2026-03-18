# Knowledge Graph Integration — Design Spec

**Date:** 2026-03-18
**Status:** Draft
**Scope:** Unified knowledge graph in Cortex — merging AC KG + Nativz vault, new sidebar entry, multi-app Supabase query layer, bidirectional GitHub sync, in-app editor

---

## 1. Overview

Consolidate the AC Knowledge Graph (~9,800 nodes: skills, SOPs, patterns, methodology) and the Nativz vault (~328 files: client profiles, meeting notes, brand assets) into a single knowledge graph accessible from:

- The Cortex admin UI (new `/admin/knowledge` page)
- The Nerd agent (semantic search + tool calling)
- Any external app (Python scripts, OpenClaw agents, other web apps) via Supabase REST API + pgvector

GitHub remains the durable, human-readable source of truth. Supabase is the universal query layer with embeddings for semantic retrieval. Bidirectional sync keeps them in lockstep.

---

## 2. Data Architecture

### 2.1 New Supabase Table: `knowledge_nodes`

A new table separate from `client_knowledge_entries`. The existing table continues to serve per-client knowledge (brand profiles, web scrapes, meeting notes). The new table is the **agency knowledge graph** — the merged AC KG + Nativz vault content.

```sql
create table knowledge_nodes (
  id            text primary key,              -- composite: "kind:slug" (e.g., "sop:google-ads")
  kind          text not null,                 -- skill | sop | pattern | methodology | moc | template | agent | project | client | mcp | industry | workflow | meeting_note | note | document
  title         text not null,
  domain        text[] not null default '{}',  -- [marketing, seo, development, design, operations, infrastructure, content, analytics, client-strategy, service-delivery]
  tags          text[] not null default '{}',
  connections   text[] not null default '{}',  -- read-only cache from GitHub frontmatter (not editable in-app)
  content       text not null default '',      -- markdown body (no frontmatter)
  metadata      jsonb not null default '{}',   -- kind-specific data (source_path, service_type, etc.)
  client_id     uuid references clients(id),   -- NULL = agency-wide, non-NULL = client-specific
  source_repo   text,                          -- GitHub repo slug ("Jacknelson6/ac-knowledge-graph")
  source_path   text,                          -- path within repo ("vault/skills/google-ads-sop.md")
  source_sha    text,                          -- last synced git blob SHA (for incremental sync)
  sync_status   text default 'synced',         -- synced | pending | failed (for async GitHub write-back)
  embedding     vector(768),                   -- Gemini text-embedding-001 (768-dim)
  fts_vector    tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', left(coalesce(content, ''), 50000)), 'B')
  ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    text                           -- user or "sync:github"
);

-- Unique constraint for dedup on import (same file in same repo = same node)
create unique index idx_kn_source on knowledge_nodes(source_repo, source_path) where source_repo is not null;

-- Indexes
create index idx_kn_kind on knowledge_nodes(kind);
create index idx_kn_client on knowledge_nodes(client_id);
create index idx_kn_domain on knowledge_nodes using gin(domain);
create index idx_kn_tags on knowledge_nodes using gin(tags);
create index idx_kn_connections on knowledge_nodes using gin(connections);
create index idx_kn_fts on knowledge_nodes using gin(fts_vector);
-- NOTE: Build IVFFlat index AFTER migration (needs rows for training):
-- create index idx_kn_embedding on knowledge_nodes using ivfflat(embedding vector_cosine_ops) with (lists = 100);

-- RPC: semantic search
create or replace function search_knowledge_nodes(
  query_embedding vector(768),
  target_client_id uuid default null,
  target_kinds text[] default null,
  target_domains text[] default null,
  match_limit int default 10,
  similarity_threshold float default 0.3
)
returns table (
  id text,
  kind text,
  title text,
  domain text[],
  tags text[],
  client_id uuid,
  content text,
  similarity float
)
language plpgsql as $$
begin
  return query
  select
    kn.id, kn.kind, kn.title, kn.domain, kn.tags, kn.client_id, kn.content,
    1 - (kn.embedding <=> query_embedding) as similarity
  from knowledge_nodes kn
  where kn.embedding is not null
    and (target_client_id is null or kn.client_id is null or kn.client_id = target_client_id)
    and (target_kinds is null or kn.kind = any(target_kinds))
    and (target_domains is null or kn.domain && target_domains)
    and 1 - (kn.embedding <=> query_embedding) > similarity_threshold
  order by kn.embedding <=> query_embedding
  limit match_limit;
end;
$$;

-- RPC: full-text search (uses stored fts_vector for performance)
create or replace function search_knowledge_nodes_fts(
  query_text text,
  target_client_id uuid default null,
  target_kinds text[] default null,
  match_limit int default 20
)
returns table (
  id text,
  kind text,
  title text,
  domain text[],
  tags text[],
  client_id uuid,
  content text,
  rank float
)
language plpgsql as $$
begin
  return query
  select
    kn.id, kn.kind, kn.title, kn.domain, kn.tags, kn.client_id, kn.content,
    ts_rank(kn.fts_vector, websearch_to_tsquery('english', query_text)) as rank
  from knowledge_nodes kn
  where kn.fts_vector @@ websearch_to_tsquery('english', query_text)
    and (target_client_id is null or kn.client_id is null or kn.client_id = target_client_id)
    and (target_kinds is null or kn.kind = any(target_kinds))
  order by rank desc
  limit match_limit;
end;
$$;
```

### 2.2 Why a New Table

The existing `client_knowledge_entries` is tightly scoped to client-specific content with `client_id` as a required FK and types like `brand_profile`, `web_page`, `meeting_note`. The AC KG has a fundamentally different schema — `kind` (skill, sop, pattern, methodology), `domain` arrays, `connections` arrays for wiki-link edges, and many nodes have no client association.

Merging into the existing table would require making `client_id` nullable, adding several columns, and rewriting all existing queries. A separate table is cleaner and doesn't risk breaking the existing per-client knowledge features.

The two tables serve complementary roles:
- `client_knowledge_entries` — per-client working knowledge (scrapes, meeting notes, brand profiles, ideas)
- `knowledge_nodes` — agency knowledge graph (SOPs, skills, patterns, methodology, client summaries)

The Nerd agent queries both tables. The new `/admin/knowledge` page queries `knowledge_nodes`.

### 2.3 GitHub as Source of Truth

**Combined repo:** Merge the AC KG vault content and Nativz vault into a single GitHub repo. Structure:

```
vault/
  skills/           # AC KG skills (1,127 nodes)
  sops/             # AC KG SOPs (82 nodes) + Nativz SOPs
  methodology/      # AC KG methodology (412 nodes)
  patterns/         # AC KG patterns (143 nodes)
  templates/        # AC KG templates (123 nodes)
  agents/           # AC KG agent definitions (41 nodes)
  mocs/             # AC KG maps of content (22 nodes)
  industries/       # AC KG industry insights (75 nodes)
  mcp/              # AC KG MCP server nodes (13 nodes)
  projects/         # AC KG projects (18 nodes)
  clients/          # Client-specific knowledge (from Nativz vault)
    toastique/
    dunston/
    ...
```

Each file is a markdown file with YAML frontmatter following the AC KG schema:

```yaml
---
id: google-ads-sop
kind: sop
title: Google Ads Standard Operating Procedure
domain: [marketing, paid-media]
tags: [google-ads, ppc, campaign-management]
connections: [google-ads-skill, paid-media-moc, campaign-architecture-pattern]
client_id: null  # null = agency-wide
created: 2026-02-23
updated: 2026-03-18
---

## Overview
(markdown content with [[wikilinks]])
```

### 2.4 Bidirectional Sync

**GitHub → Supabase (import):**
1. API route `POST /api/knowledge/sync` (auth-gated: admin role OR `SYNC_SECRET` header) triggers sync
2. Uses `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1` to get ALL file paths + SHAs in a single API call
3. Compares blob SHAs against `source_sha` in Supabase — only fetches files whose SHA differs (incremental)
4. Parses frontmatter + body for changed files
5. Upserts into `knowledge_nodes` (conflict target: `source_repo, source_path`)
6. Generates embeddings for new/changed nodes (Gemini text-embedding-001, rate-limited 100/min)
7. Stores `source_sha` for next sync

**Supabase → GitHub (export on write):**
1. When a node is created/edited in Cortex, the API route:
   a. Writes to Supabase immediately (sets `sync_status: 'pending'`)
   b. Fires non-blocking GitHub write-back (formats as markdown with frontmatter, commits via PUT API)
   c. On success: updates `source_sha` + `sync_status: 'synced'`
   d. On failure: sets `sync_status: 'failed'` (UI shows indicator, can retry)
2. Uses GitHub API `PUT /repos/:owner/:repo/contents/:path` with the SHA for conflict detection

**Conflict resolution:** Last-write-wins with SHA check. If the GitHub SHA doesn't match, the write-back fails gracefully (sets `sync_status: 'failed'`), and the next full sync resolves it.

---

## 3. UI Design

### 3.1 Sidebar Entry

Add "Knowledge" to the MANAGE section of the admin sidebar, below "Analytics":

```
MANAGE
  Clients
  Team
  Analytics  >
  Knowledge     ← NEW (icon: Brain or Network)
```

### 3.2 `/admin/knowledge` Page Layout

Split-panel layout:

```
┌─────────────────────────────────────────────────────────┐
│  Knowledge Graph                              [Sync] ⟳  │
│  ┌──────────────────┐  ┌────────────────────────────┐   │
│  │ Filter: [All ▾]  │  │                            │   │
│  │ Kind:  [All ▾]   │  │     2D Force-Directed      │   │
│  │ Domain:[All ▾]   │  │     Graph Visualization     │   │
│  │ ┌──────────────┐ │  │     (D3 canvas)            │   │
│  │ │ 🔍 Search... │ │  │                            │   │
│  │ └──────────────┘ │  │     Click node to select   │   │
│  │                  │  │     in list + show detail   │   │
│  │ ▸ SOPs (82)      │  │                            │   │
│  │ ▸ Skills (1,127) │  │                            │   │
│  │ ▸ Patterns (143) │  │                            │   │
│  │ ▸ Methodology    │  │                            │   │
│  │ ▸ Clients (57)   │  │                            │   │
│  │ ▸ ...            │  │                            │   │
│  │                  │  │                            │   │
│  │ [+ New node]     │  │                            │   │
│  └──────────────────┘  └────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Left panel (list):**
- Search bar with semantic search (queries Supabase pgvector)
- Filter dropdowns: Client (All / Agency / individual), Kind, Domain
- Collapsible sections grouped by kind, showing node count
- Each item shows: title, kind badge, domain tags
- Click → highlights in graph + opens detail panel
- "+ New node" button at bottom

**Right panel (graph):**
- Reuse existing `KnowledgeGraph.tsx` component (2D canvas force-directed)
- **Performance constraint:** The existing physics simulation is O(n^2). Cap graph at ~500 nodes max by always filtering (client, kind, domain, or search result neighborhood). Full corpus lives in the list/search panel only.
- Default view: show MOCs + their 1-hop connections (~200-300 nodes). Selecting a kind/client/domain narrows further.
- Extend `TYPE_COLORS` to include AC KG kinds (skill, sop, pattern, methodology, moc, template, agent)
- Add kind coloring: skill=#38bdf8, sop=#22c55e, pattern=#a78bfa, methodology=#f59e0b, moc=#f472b6, template=#64748b, agent=#fb923c
- Click node → selects in left panel list + opens detail slide-in
- Zoom, pan, node size by connection count (existing features)
- **Graph endpoint returns lightweight data only** — `id, title, kind, domain, connections` (no content). Content loaded on-demand when detail panel opens.

**Detail panel (slide-in from right):**
- Markdown preview of node content
- Edit button → in-app markdown editor (reuse `EntryEditor.tsx`)
- Metadata sidebar: kind, domain, tags, connections (as clickable links)
- "View in GitHub" link
- Save → writes to Supabase + commits to GitHub

### 3.3 Client-Scoped View

When a client is selected in the filter dropdown:
- Graph shows only nodes where `client_id = selected` OR `client_id IS NULL` (agency nodes connected to client nodes)
- List filters to client-specific nodes
- This replaces navigating to `/admin/clients/[slug]/knowledge` for graph viewing

### 3.4 Per-Client Knowledge Page Enhancement

The existing `/admin/clients/[slug]/knowledge` page stays as-is for the detailed client vault experience (brand profiles, web scrapes, meeting notes). Add a link/button: "View in knowledge graph →" that navigates to `/admin/knowledge?client=[slug]`.

---

## 4. API Routes

### 4.1 New Routes

```
GET    /api/knowledge/nodes          — List nodes (filterable by kind, domain, client_id, search)
GET    /api/knowledge/nodes/[id]     — Get single node with full content
POST   /api/knowledge/nodes          — Create node (writes to Supabase + GitHub)
PUT    /api/knowledge/nodes/[id]     — Update node (writes to Supabase + GitHub)
DELETE /api/knowledge/nodes/[id]     — Soft-delete (archive) node
GET    /api/knowledge/graph          — Get graph data (nodes + edges from connections arrays)
POST   /api/knowledge/search         — Semantic search (embedding query)
POST   /api/knowledge/sync           — Trigger GitHub → Supabase sync
```

### 4.2 Query Parameters for List/Graph

```
?client_id=uuid          — Filter by client (omit for all, "agency" for client_id IS NULL)
?kind=sop,skill          — Filter by kind(s)
?domain=marketing,seo    — Filter by domain(s)
?q=search+terms          — Full-text search
?limit=100&offset=0      — Pagination
```

---

## 5. Nerd Integration

### 5.1 New/Updated Tools

Add to `lib/nerd/tools/knowledge.ts`:

```typescript
// Search the agency knowledge graph (SOPs, skills, patterns, methodology)
search_agency_knowledge(query: string, kinds?: string[], domains?: string[]): KnowledgeNode[]

// Get a specific knowledge node by ID
get_knowledge_node(id: string): KnowledgeNode

// Create a new knowledge node
create_knowledge_node(title, kind, domain, tags, content, client_id?): KnowledgeNode
```

### 5.2 Context Assembly

The Nerd's system prompt already mentions QMD pattern. When the Nerd receives a question:
1. Search `knowledge_nodes` via semantic search (agency-wide SOPs, skills, patterns)
2. Search `client_knowledge_entries` for client-specific data (if a client is mentioned)
3. Combine results into context for the LLM

This gives the Nerd access to all AC KG methodology + all client data in a single query flow.

---

## 6. Migration Plan

### 6.1 One-Time Import Script

`scripts/migrate-kg-to-supabase.mjs`:

1. Read all `.md` files from the AC KG repo (`vault/` directory)
2. Parse YAML frontmatter using `scripts/lib/frontmatter.mjs`
3. Map to `knowledge_nodes` schema
4. Batch-insert into Supabase (500 rows at a time)
5. Generate embeddings in parallel (Gemini, rate-limited to 100/min)
6. Report: nodes imported, errors, embedding coverage

### 6.2 Nativz Vault Import

Same script, second pass:
1. Read client directories from Nativz vault
2. Map client directory names to `clients.id` via slug lookup
3. Insert as `knowledge_nodes` with `client_id` set
4. Generate embeddings

### 6.3 Combined GitHub Repo

After import, merge both vaults into a single repo:
1. Copy AC KG `vault/` as-is
2. Copy Nativz vault client directories into `vault/clients/`
3. Standardize all frontmatter to the unified schema
4. Update `GITHUB_VAULT_REPO` env var to point to the combined repo
5. The existing `lib/vault/github.ts` reader continues to work (same file structure)

---

## 7. Multi-App Access

Any app at the agency can query the knowledge graph via:

### 7.1 Supabase REST API (auto-generated)
```bash
# Semantic search
curl -X POST 'https://your-project.supabase.co/rest/v1/rpc/search_knowledge_nodes' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"query_embedding": [...], "target_kinds": ["sop", "skill"], "match_limit": 5}'

# List nodes by kind
curl 'https://your-project.supabase.co/rest/v1/knowledge_nodes?kind=eq.sop&domain=cs.{marketing}' \
  -H 'apikey: YOUR_ANON_KEY'
```

### 7.2 Supabase Client Libraries
```python
# Python
from supabase import create_client
supabase = create_client(url, key)
result = supabase.rpc('search_knowledge_nodes', {
    'query_embedding': embedding,
    'target_kinds': ['sop', 'skill'],
    'match_limit': 5
}).execute()
```

```typescript
// TypeScript (any app)
const { data } = await supabase.rpc('search_knowledge_nodes', {
  query_embedding: embedding,
  target_kinds: ['sop', 'skill'],
  match_limit: 5,
});
```

### 7.3 Row-Level Security

```sql
alter table knowledge_nodes enable row level security;

-- Authenticated users can read all nodes
create policy "Authenticated users can read all knowledge"
  on knowledge_nodes for select
  to authenticated
  using (true);

-- Only admins can write (uses users table subquery, matching project convention)
create policy "Admins can write knowledge"
  on knowledge_nodes for insert
  to authenticated
  with check (exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'));

create policy "Admins can update knowledge"
  on knowledge_nodes for update
  to authenticated
  using (exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'));

create policy "Admins can delete knowledge"
  on knowledge_nodes for delete
  to authenticated
  using (exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'));

-- External apps use service_role key (bypasses RLS entirely)
-- No anonymous/anon key access — all access requires authentication
```

---

## 8. Implementation Order

1. **Database** — Create `knowledge_nodes` table + RPCs + indexes
2. **Migration script** — Import AC KG + Nativz vault into Supabase
3. **Lib layer** — `lib/knowledge/graph-queries.ts` (CRUD + search for `knowledge_nodes`)
4. **API routes** — `/api/knowledge/*` endpoints
5. **Sidebar + page** — Add nav item, create `/admin/knowledge` with split layout
6. **Graph component** — Extend `KnowledgeGraph.tsx` with new kind colors + agency graph support
7. **List panel** — Searchable, filterable node list with kind grouping
8. **Detail panel** — Slide-in markdown preview + editor
9. **GitHub sync** — Bidirectional sync (import + write-back)
10. **Nerd tools** — Add `search_agency_knowledge` + `get_knowledge_node` tools
11. **Node editor** — In-app create/edit with GitHub commit

---

## 9. Files to Create/Modify

### New Files
- `lib/knowledge/graph-queries.ts` — CRUD + search for `knowledge_nodes`
- `lib/knowledge/github-sync.ts` — Bidirectional GitHub ↔ Supabase sync
- `app/admin/knowledge/page.tsx` — Main knowledge graph page
- `app/admin/knowledge/knowledge-client.tsx` — Client component with graph + list + detail
- `app/api/knowledge/nodes/route.ts` — List + create nodes
- `app/api/knowledge/nodes/[id]/route.ts` — Get + update + delete node
- `app/api/knowledge/graph/route.ts` — Graph data endpoint
- `app/api/knowledge/search/route.ts` — Semantic search endpoint
- `app/api/knowledge/sync/route.ts` — GitHub sync trigger
- `components/knowledge/KnowledgeExplorer.tsx` — Split-panel layout (list + graph)
- `components/knowledge/NodeList.tsx` — Searchable, filterable node list
- `components/knowledge/NodeDetail.tsx` — Slide-in detail panel with editor
- `scripts/migrate-kg-to-supabase.mjs` — One-time migration script

### Modified Files
- `components/layout/admin-sidebar.tsx` — Add "Knowledge" nav item
- `components/knowledge/KnowledgeGraph.tsx` — Add AC KG kind colors, accept optional `clientId` filter
- `lib/nerd/tools/knowledge.ts` — Add agency knowledge search tools
- `lib/nerd/tools/index.ts` — Register new tools

---

## 10. Success Criteria

- All ~10,100 nodes (9,800 AC KG + 300 Nativz) queryable from Supabase
- Semantic search returns relevant results in <500ms
- Graph renders 10K+ nodes at interactive framerates (2D canvas)
- Client filter shows only relevant nodes
- In-app edits persist to both Supabase and GitHub
- External apps can query via Supabase REST API
- The Nerd can search agency knowledge + client knowledge in a single flow
