# Client Repo — design

**Spec version:** 0.3 (planning-ready, post-self-review).
**Status:** Implementation plan not yet written.

**Authors:** Jack + Claude.
**Started:** 2026-04-24. **Last revised:** 2026-04-25.

**Slot already prepared:** `components/clients/settings/info-brand-dna-slim.tsx`, the slim "Brand DNA" placeholder on `/admin/clients/[slug]/settings/info`. When this ships, that placeholder is swapped for `InfoClientRepoCard`.

---

## 1. Problem

Today, a client's brand intelligence is split four ways:

| Where it lives | What's there | Who/what reads it |
|---|---|---|
| `clients` table columns | voice, audience, keywords, tagline, products, etc. | Every AI flow via `getClient()` helpers |
| `client_knowledge_entries` (type=`brand_guideline`) | One AI-distilled markdown blob with bento metadata | `BrandDNAView`, `searchKnowledge*` |
| Google Drive folders linked from `clients.google_drive_branding_url` etc. | Raw brand books, fonts, logos as files | Humans only — agents can't see in |
| Notion pages and email attachments | The brand books that never made it into Cortex | Nobody in Cortex |

Every agent (topic search, ideation, ad creative, nerd, etc.) that wants the *real* brand context has to either:

1. Hope the structured fields are filled out (often partial, manually maintained).
2. Run a multimodal call against the client website on every flow (slow, expensive, non-deterministic).
3. Fall back to vague guesses.

**Jack's framing (paraphrased):** "Make Brand DNA irrelevant. Replace it with a Supabase repo per client — branding guidelines, uploaded PDFs converted to markdown, everything super easily accessible for our agents so we don't have to multimodal every call. Logos stay as images so they preserve their look."

**Goal:** a per-client knowledge filesystem that holds the source files, auto-extracts plain text from anything textual, preserves images as files, and becomes the single retrieval surface that agents read from.

---

## 2. Scope

### 2.1 In scope (v1)

- One **Supabase Storage bucket** for all client repo files, RLS-scoped by `client_id` matching the path prefix.
- A new table `client_repo_documents` indexing every uploaded file with metadata + the original file pointer, plus a child `client_repo_chunks` table holding **chunked embeddings** (~500-token passages) so retrieval snippets reflect the *matching passage* rather than the document head. Chunked embeddings are v1, not v1.5 — without them, retrieval against long brand books is a regression vs. the current single-blob `brand_guideline` and shadow mode would deliver a worse experience to agents.
- An **upload + browse UI** at `/admin/clients/[slug]/repo` (full surface) and a slim `InfoClientRepoCard` swap on the info page.
- A **PDF/DOCX → markdown ingestion pipeline** triggered on upload. Cron-backed for retries; serverless function does the actual conversion.
- An **agent retrieval API** (`lib/knowledge/repo.ts → searchClientRepo`) returning ranked **chunks** with source-file references.
- **Backfill** of existing `brand_guideline` rows so flows that switch to the new search keep working without a content migration day.
- A **two-week shadow-mode period** where agents call both old + new retrieval and we log discrepancies before flipping the default per call site.
- **Hard-delete (GDPR-safe) path** for individual documents and for "delete all data for this client." Soft-delete is the default user action; hard-delete is an explicit admin escalation that removes the storage object, the row, and any embedding.
- **Janitor cron** that reaps soft-deleted documents older than 30 days and any storage objects that have no row pointing at them.

### 2.2 Out of scope (v1, deferred to v2 unless flagged)

- Agent-driven file editing — admin upload-only. Editing is a re-upload.
- Per-file ACLs beyond client-scoped — no per-document share links.
- Portal-side visibility — admin-only first; a curated client-facing view ships if asked.
- Real-time collab / multi-cursor editing — markdown previews are read-only.
- Vercel Blob — staying on Supabase Storage for parity.
- Replacing `BrandDNAView` on `/settings/brand` — that bento-grid stays. Only the info-page slim placeholder swaps in v1.
- Document **versioning** / diff viewer.
- AI-suggested category routing on upload.
- Cross-client search across all repos.

### 2.3 Anti-scope (explicitly NOT building, ever, unless requirements change)

- A WYSIWYG markdown editor. The repo holds source files; editing markdown is `cat | $EDITOR | upload` workflow.
- Per-document permissions distinct from per-client.
- Multi-region storage replication. Supabase's default region per project is fine.
- A search index outside Postgres (no Algolia / Elastic / Meilisearch).

---

## 3. Architecture

### 3.1 Storage layout

Single multi-tenant private bucket, path-prefixed by client:

```
client-repo/
  <client_id>/
    <document_id>.<ext>            # original upload, immutable
    <document_id>.images/          # extracted page images for image-heavy PDFs (v1.5)
      page-<n>.png
```

**Naming convention:** the bucket is `client-repo` (kebab — Supabase convention), the table is `client_repo_documents` (snake — Postgres convention). Don't "fix" the inconsistency.

**Why a single bucket vs. one per client:** Supabase Storage allows ~hundreds of buckets per project but RLS is more legible against a single bucket with path-prefix checks than against bucket existence. A migration to per-client buckets is cheap if RLS feels brittle in practice.

**Bucket settings:** private, no public URL, served via signed URLs (5-minute TTL) for previews. Max file size 80 MB per upload (raised from the spec's first-pass 50 MB after acknowledging that real-world brand books routinely sit at 30–80 MB; configurable to 5 GB if needed).

**RLS sketch:**

```sql
-- The is_admin() helper is defined in supabase/migrations/040_security_hardening.sql
-- and used by the existing topic_searches policies. We reuse it verbatim.
create policy storage_repo_read on storage.objects for select using (
  bucket_id = 'client-repo' and (
    is_admin(auth.uid())
    or split_part(name, '/', 1)::uuid in (
      select c.id from clients c
      join user_client_access uca on uca.client_id = c.id
      where uca.user_id = auth.uid()
    )
  )
);

-- Write: admin only
create policy storage_repo_write on storage.objects for insert with check (
  bucket_id = 'client-repo' and is_admin(auth.uid())
);
```

### 3.2 Database schema

```sql
-- supabase/migrations/<next>_client_repo_documents.sql
create extension if not exists vector;

create type repo_document_category as enum (
  'guideline', 'logo', 'font', 'reference', 'contract', 'misc'
);

create type repo_ingestion_status as enum (
  'pending', 'processing', 'done', 'failed', 'skipped'
);

create table client_repo_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- File identity
  storage_path text not null,                  -- bucket-relative path
  filename text not null,                      -- display name (user-supplied or original)
  mime_type text not null,
  size_bytes integer not null,
  checksum text,                               -- sha256, dedupe + change-detection

  -- Categorization
  category repo_document_category default 'misc',
  tags text[] default '{}',                    -- free-form, e.g. ['v2', 'final']

  -- Extraction
  markdown_content text,                       -- null for non-textual files (logos)
  extraction_metadata jsonb default '{}'::jsonb, -- { parser, page_count, char_count, image_count, ... }

  -- Lifecycle
  ingestion_status repo_ingestion_status default 'pending',
  ingestion_error text,
  ingestion_retries smallint default 0,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz                       -- soft delete; janitor reaps after 30d
);

create table client_repo_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references client_repo_documents(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade, -- denormalized for index pruning
  chunk_index smallint not null,               -- position within document, 0-based
  content text not null,                       -- the ~500-token passage
  embedding vector(768) not null,              -- gemini-embedding-001
  token_count smallint,
  metadata jsonb default '{}'::jsonb,          -- { page_number, heading_path, ... }
  created_at timestamptz default now()
);

create index client_repo_documents_client_idx
  on client_repo_documents (client_id, created_at desc)
  where deleted_at is null;

create index client_repo_documents_pending_idx
  on client_repo_documents (created_at)
  where ingestion_status = 'pending';

create index client_repo_documents_checksum_idx
  on client_repo_documents (client_id, checksum)
  where deleted_at is null;

create index client_repo_chunks_client_idx
  on client_repo_chunks (client_id);

create index client_repo_chunks_embedding_idx
  on client_repo_chunks using ivfflat (embedding vector_cosine_ops);

alter table client_repo_documents enable row level security;
alter table client_repo_chunks enable row level security;

create policy admin_all on client_repo_documents for all using (is_admin(auth.uid()));
create policy admin_all on client_repo_chunks for all using (is_admin(auth.uid()));

create policy viewer_select on client_repo_documents for select using (
  client_id in (select client_id from user_client_access where user_id = auth.uid())
);
create policy viewer_select on client_repo_chunks for select using (
  client_id in (select client_id from user_client_access where user_id = auth.uid())
);

create trigger client_repo_documents_set_updated_at
  before update on client_repo_documents
  for each row execute function set_updated_at();
```

**Embedding regeneration policy:**

| Edit | Re-embed? | Why |
|---|---|---|
| Rename | no | filename isn't the embedding source |
| Recategorize / retag | no | category/tags aren't the embedding source |
| Re-upload (replace file) | yes | content changed; chunks regenerated |
| Manual "retrigger ingestion" | yes | explicit user request |
| Soft-delete | n/a | row hidden, embeddings stay until janitor |

### 3.3 Retrieval RPC

Modeled on the existing `search_knowledge_semantic` (see `supabase/migrations/082_knowledge_search_rpcs.sql`).

```sql
create or replace function search_client_repo(
  client_id_in uuid,
  query_embedding vector(768),
  match_count int default 8,
  category_filter repo_document_category[] default null,
  min_similarity float default 0.65
)
returns table (
  document_id uuid,
  chunk_id uuid,
  filename text,
  category repo_document_category,
  snippet text,                       -- the matching ~500-token passage
  page_number smallint,               -- nullable; populated for PDFs
  similarity float,
  storage_path text
)
language sql stable as $$
  select
    d.id as document_id,
    c.id as chunk_id,
    d.filename,
    d.category,
    c.content as snippet,
    nullif((c.metadata->>'page_number')::smallint, 0) as page_number,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.storage_path
  from client_repo_chunks c
  join client_repo_documents d on d.id = c.document_id
  where c.client_id = client_id_in
    and d.deleted_at is null
    and (category_filter is null or d.category = any(category_filter))
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```

### 3.4 Ingestion pipeline

Two paths based on file size + format:

| Format | Size | Path | Latency budget |
|---|---|---|---|
| `.md`, `.txt` | any | sync inline at upload | <500ms |
| `.docx` | <2 MB | sync inline at upload | <2s |
| `.docx` | ≥2 MB | async via cron sweep | <30s end-to-end |
| `.pdf` | any | async via cron sweep | <60s typical, <300s for OCR fallback |
| Image files (`.png`, `.jpg`, `.svg`) | any | sync at upload, no markdown extraction; embedding from `category + filename + tags` so they're still searchable by name | <500ms |

**Parser stack (decided during planning, but defaults below):**

1. **Text files (`.md`, `.txt`):** native (already a string).
2. **DOCX:** `mammoth.js` (MIT, pure JS, ~50 KB). Outputs HTML; we run a quick HTML→markdown pass via `turndown`.
3. **PDF — text-rich (default):** `unpdf` (MIT, pure JS, no native deps, runs cleanly in Vercel Functions). Outputs per-page text.
4. **PDF — image-heavy fallback:** Mistral OCR via OpenRouter (already wired). Cost ~$0.001/page; acceptable for the long tail of design-heavy brand books.

**OCR fallback threshold (PROVISIONAL):** trigger Mistral OCR when `unpdf` returns < 80 chars per page averaged across the document. **80 was picked by reasoning, not measurement** — it must be calibrated during planning against ≥5 real-world brand books from existing clients (Goldback, RankPrompt, Ampersand, etc. — pick variety: design-heavy, text-heavy, mixed). Acceptable signal: text-rich docs all stay on `unpdf`, image-heavy docs all flip to OCR, no false flips. Bake the calibrated number into a single named constant `OCR_FALLBACK_CHARS_PER_PAGE`.

**Chunking strategy (v1):** split markdown on heading boundaries first, then on paragraph boundaries within a heading section, capping at ~500 tokens / chunk. Each chunk gets a single embedding. Heading path (e.g., `Brand voice / Tone`) stored in `metadata.heading_path` for context-rich snippets later.

**Trigger mechanism:**

- **Sync path:** API route writes the document row + chunks rows + embeddings inline; returns 200 with the row.
- **Async path:** API route writes the document row with `ingestion_status='pending'`, returns 202. A cron job at `/api/cron/repo-ingest` sweeps every 60s, claims up to 5 pending rows in a single transaction (`update ... where status='pending' returning ...`), processes them, writes back. Failures bump `ingestion_retries`; after 3 failures the row goes to `ingestion_status='failed'` with `ingestion_error` populated.

**Embedding generation:** reuse `lib/ai/embeddings.ts → embedText()`. Same `gemini-embedding-001` model, same 768 dim — so the column type matches `client_knowledge_entries.embedding` exactly and a future migration could merge tables if we wanted.

### 3.5 Retrieval API

```ts
// lib/knowledge/repo.ts
export interface RepoSearchResult {
  documentId: string;
  chunkId: string;
  filename: string;
  category: 'guideline' | 'logo' | 'font' | 'reference' | 'contract' | 'misc';
  snippet: string;          // the matching ~500-token chunk
  pageNumber: number | null; // PDF page if known
  similarity: number;       // 0-1, cosine
  storagePath: string;      // for "view source" deep-link
}

export interface RepoSearchOptions {
  limit?: number;           // default 8
  minSimilarity?: number;   // default 0.65
  categories?: Array<RepoSearchResult['category']>;
}

export async function searchClientRepo(
  clientId: string,
  query: string,
  opts: RepoSearchOptions = {},
): Promise<RepoSearchResult[]>;
```

**Empty-results semantics:**

- A repo with zero indexed chunks (new client) returns `[]`. Callers MUST treat `[]` as "no opinion" rather than "definitely nothing relevant," and fall back to whatever they did before for that case.
- A repo with chunks but where every chunk scored below `minSimilarity` also returns `[]`. Same caller behavior.
- A failure (network, RPC error, embedding API down) THROWS. Callers in shadow mode must `try`/`catch` around it so the legacy path isn't disrupted.

Implementation: embed `query` via `embedText()`; call `search_client_repo` RPC. Mirrors `searchKnowledge*` in shape so swapping call sites is mechanical.

### 3.6 HTTP API

| Method | Path | Purpose | Body / Query | Returns |
|---|---|---|---|---|
| `POST` | `/api/clients/[id]/repo/upload` | Upload one or more files | `multipart/form-data`: `files[]`, optional `category` per file | `{ documents: Array<{ id, filename, ingestion_status }> }` |
| `GET` | `/api/clients/[id]/repo` | List documents | `?category=...&limit=...&cursor=...` | `{ documents: Doc[], next_cursor }` |
| `GET` | `/api/clients/[id]/repo/[docId]` | Fetch single doc with markdown + signed url | — | `{ id, ..., markdown_content, signed_url }` |
| `PATCH` | `/api/clients/[id]/repo/[docId]` | Rename, recategorize, retag, retrigger ingestion | `{ filename?, category?, tags?, retrigger_ingestion? }` | Updated row |
| `DELETE` | `/api/clients/[id]/repo/[docId]` | Soft delete | `?hard=true` for hard-delete (admin escalation: removes storage object + chunks + row) | `204` |
| `DELETE` | `/api/clients/[id]/repo` | **Hard-delete every document for a client** (GDPR escape hatch) | requires `?confirm=<client_slug>` | `{ deleted: n }` |
| `POST` | `/api/cron/repo-ingest` | Sweep pending rows | header `Authorization: Bearer $CRON_SECRET` | `{ processed: n, failed: n }` |
| `POST` | `/api/cron/repo-janitor` | Reap soft-deleted rows >30 days old + orphaned storage objects | header `Authorization: Bearer $CRON_SECRET` | `{ reaped_rows: n, reaped_objects: n }` |
| `GET` | `/api/clients/[id]/repo/search` | Server-side proxy for `searchClientRepo` (used by admin search bar) | `?q=...&category=...` | `RepoSearchResult[]` |

All routes:

- **Auth:** `supabase.auth.getUser()` → fail 401 if no user. Cron routes verify `Authorization: Bearer $CRON_SECRET` against the `CRON_SECRET` env (already used by other crons in the codebase).
- **Authz:** for admin routes, `is_admin` check; for viewer-readable routes, `getEffectiveAccessContext` + filter by `clientIds`.
- **Validation:** Zod schemas at the top of each route.
- **Errors:** `{ error: string, hint?: string }` with appropriate status codes.

### 3.7 UI surfaces

#### 3.7.1 Full surface — `/admin/clients/[slug]/repo`

**Note on wireframe glyphs:** the 📄/🖼️/⟳ characters below are wireframe shorthand only. The actual implementation uses `lucide-react` icons (`FileText`, `ImageIcon`, `Loader2`, etc.) — same as the rest of the admin UI. Don't ship emojis.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ← Back to client                                                            │
│                                                                              │
│  📁 Repo                                              [+ Upload files]       │
│  Knowledge files for {clientName}. Drop a PDF or upload a brand book — we'll│
│  convert it to searchable text and feed it to every AI flow in Cortex.       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  drag-and-drop zone (full width, dashed border)                         │ │
│  │  Drop files here or click to browse · max 80 MB per file                │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────┬────────────────────────┬──────────┬─────────┬────────┐ │
│  │ FILE            │ CATEGORY               │ STATUS   │ SIZE    │       │ │
│  ├─────────────────┼────────────────────────┼──────────┼─────────┼────────┤ │
│  │ 📄 brand-book   │ Guideline              │ ✓ Ready  │ 12 MB   │ ⋯     │ │
│  │ 🖼️ logo-mark    │ Logo                   │ ✓ Ready  │ 240 KB  │ ⋯     │ │
│  │ 📄 voice-and-tone│ Guideline             │ ⟳ Parse  │ 800 KB  │ ⋯     │ │
│  │ 📄 contract-2025│ Contract               │ ⚠ Failed │ 4.2 MB  │ ⋯     │ │
│  └─────────────────┴────────────────────────┴──────────┴─────────┴────────┘ │
│                                                                              │
│  Click a row to open the side panel:                                         │
│  ┌────────────────────────────────────────────────────────┐                 │
│  │ brand-book.pdf                              ✕ close    │                 │
│  │ ─────────────────────────────────────────              │                 │
│  │ Category  Guideline                                     │                 │
│  │ Uploaded  2d ago by Jack                               │                 │
│  │ Source    [Download original]  [Open in tab]           │                 │
│  │                                                         │                 │
│  │ ## Brand voice                                          │                 │
│  │ We speak like… <markdown preview>                       │                 │
│  └────────────────────────────────────────────────────────┘                 │
└────────────────────────────────────────────────────────────────────────────┘
```

**Components needed:**

- `RepoUploadZone` — drag-and-drop with progress bar per file, multi-file support.
- `RepoDocumentList` — sortable table grouped by `category`, virtualized once a client has > 100 docs.
- `RepoDocumentSidePanel` — slide-in from the right with markdown preview, file metadata, actions (rename, recategorize, redownload, retrigger ingestion, soft-delete, hard-delete behind a confirm).
- `RepoSearchBar` — top-right search box that posts to `/api/clients/[id]/repo/search` and highlights matching rows.

Reuses the existing `InfoCard` chrome where appropriate; no new design system primitives needed.

**Sentence-case copy** — per CLAUDE.md, all user-facing strings are sentence case. "Brand structure", "Brand voice", "Brand essence" in this spec refer to the *concepts*; in actual UI copy use sentence case ("Brand structure", not "Brand Structure").

#### 3.7.2 Slim card on info page — `InfoClientRepoCard`

Replaces `InfoBrandDnaSlim` once shipped:

```
┌──────────────────────────────────────────────────────────────────┐
│  📁  Repo                                       [Open repo →]    │
│  ──────────────────────────────────────────────────────────────  │
│  ● 12 files · last upload 2d ago                                  │
│                                                                    │
│  Recent:                                                           │
│   📄 brand-book.pdf            Guideline · Ready                   │
│   🖼️ logo-mark.svg             Logo · Ready                        │
│   📄 voice-and-tone.docx       Guideline · Parsing                 │
│                                                                    │
│  [+ Upload files]                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### 3.7.3 Brand DNA card — what happens to it

The existing `InfoBrandDnaSlim` stays in the codebase but is no longer rendered on the info page. The `BrandDNAView` bento on `/admin/brand-profile` and `/admin/clients/[slug]/settings/brand` continues to render — backed by the backfilled `client_repo_documents` row when the legacy `client_knowledge_entries` row is removed (v2). For v1, both surfaces coexist; the legacy view reads from `client_knowledge_entries` and the new repo reads from `client_repo_documents`.

---

## 4. Migration

### 4.1 Forward migration (one-shot, runs after schema migration)

Script: `scripts/backfill-client-repo.ts`.

```ts
// Defensive: ORDER BY updated_at DESC LIMIT 1 because a client can have
// stale superseded rows whose `superseded_by` points at a row that itself
// got deleted, leaving more than one with `superseded_by IS NULL`.
for each client where exists brand_guideline in client_knowledge_entries:
  read the LATEST brand_guideline row (content, embedding, metadata, updated_at)
    where metadata->>'superseded_by' is null
    order by updated_at desc limit 1
  upload synthetic file to client-repo/<clientId>/<docId>.md with the markdown content
  insert into client_repo_documents (
    client_id, storage_path, filename = 'brand-guideline.md',
    mime_type = 'text/markdown', size_bytes = byte_length(content),
    checksum = sha256(content), category = 'guideline',
    markdown_content = content,
    extraction_metadata = { source: 'backfill', original_entry_id, original_updated_at },
    ingestion_status = 'done',
    uploaded_by = (a system user uuid)
  )
  // Run the chunker on `content`, write client_repo_chunks rows. Re-embed
  // each chunk fresh (we can't reuse the legacy whole-doc embedding on
  // chunks). Cost: at the time of backfill, embedding RPS is throttled
  // to stay inside Gemini's free tier (1500 RPD).
```

**Idempotency:** the script is safe to re-run. Skips clients where `client_repo_documents` already has a row with `extraction_metadata->>'source' = 'backfill'`.

**Verification queries:**

```sql
-- Every client with a live brand_guideline now has a repo doc.
select c.id, c.name
from clients c
where exists (select 1 from client_knowledge_entries
              where client_id = c.id and type = 'brand_guideline'
              and metadata->>'superseded_by' is null)
  and not exists (select 1 from client_repo_documents
                  where client_id = c.id
                  and category = 'guideline'
                  and extraction_metadata->>'source' = 'backfill');

-- Every backfilled doc has at least one chunk with an embedding.
select d.id from client_repo_documents d
where d.extraction_metadata->>'source' = 'backfill'
  and not exists (select 1 from client_repo_chunks c
                  where c.document_id = d.id and c.embedding is not null);
```

Both should return zero rows.

### 4.2 Backward compatibility

- `client_knowledge_entries` rows kept indefinitely. Any agent that hasn't migrated still works.
- `BrandDNAView` continues to read the legacy table.
- The new `searchClientRepo` runs in parallel with `searchKnowledge*` for two weeks (shadow mode).

### 4.3 Rollback

If the new pipeline breaks, the legacy path is untouched. Drop the routes from the navigation, soft-delete the `client_repo_documents` rows (no destructive change to historical data), and the surface disappears. Schema can stay (idempotent on next ship).

---

## 5. Agent integration cutover

**Known call sites today** (`grep -r "searchKnowledge" lib/ --include="*.ts"`):

1. `lib/knowledge/search.ts` — public retrieval API.
2. `lib/knowledge/search-supabase.ts` — Postgres-side search helpers.
3. `lib/knowledge/graph-queries.ts` — graph + node search.
4. `lib/knowledge/supersession-detector.ts` — used during knowledge-entry writes; not a retrieval call site, so excluded from cutover.
5. `lib/nerd/tools/knowledge.ts` — Nerd agent's primary knowledge tool.
6. `lib/nerd/tools/agency-knowledge.ts` — Nerd agent's agency-knowledge tool.
7. (Re-grep at planning time to confirm count hasn't drifted.)

**Per-flow flip — not global flip.** The cutover order:

| Order | Flow | Why this order |
|---|---|---|
| 1 | `lib/nerd/tools/knowledge.ts` | Nerd is internal, low blast radius if retrieval regresses |
| 2 | `lib/nerd/tools/agency-knowledge.ts` | Same surface, similar risk profile |
| 3 | Topic search ideation flows that read from `searchKnowledge*` | Higher visibility but still admin-only |
| 4 | Anything portal-facing | Last; user-facing failures hurt most |

Each step gates on shadow metrics for *that flow* meeting the bar (defined below).

**Phased timeline:**

| Week | Phase | Action |
|---|---|---|
| 0 | Ship | Deploy schema + routes + UI + `searchClientRepo`. No agent changes. Backfill runs. |
| 1–2 | Shadow | Update each agent flow to ALSO call `searchClientRepo`, log both result sets. UI/agent uses the legacy result. |
| 3 | Compare | Review shadow logs per flow. |
| 4 | Flip | For each flow that meets the bar, drop the legacy call. |

### 5.1 Shadow log + comparison metrics

**`repo_shadow_log` schema:**

```sql
create table repo_shadow_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  query_hash text not null,             -- sha256 of the query, NEVER the plaintext
  query_embedding_hash text,            -- sha256 of the query embedding for grouping
  legacy_top_id uuid,
  legacy_top_similarity float,
  legacy_top_count int,                 -- how many results legacy returned
  repo_top_id uuid,                     -- client_repo_documents.id (parent of best chunk)
  repo_top_similarity float,
  repo_top_count int,
  ranks_agreed boolean,                 -- both ranked the same source #1
  flow text not null,                   -- 'nerd', 'topic_search', 'ideation', etc.
  created_at timestamptz default now()
);

create index repo_shadow_log_flow_idx on repo_shadow_log (flow, created_at desc);
-- Auto-purge: rows older than 14d are deleted by the janitor cron.
```

**Why hash the query?** Plaintext queries during shadow contain client PII (names, internal codenames, contract terms). We need the cardinality (how often does the same query repeat) but not the content. If we need plaintext to debug a specific outlier, we add structured logging behind a feature flag, scoped to a single client, with admin opt-in.

**Per-flow flip metrics — must hit ALL of:**

| Metric | Threshold | Why |
|---|---|---|
| `ranks_agreed` rate | ≥ 60% | Agreement is a baseline signal; lower means systems disagree more than they agree |
| Manual review of disagreements | "new path is better or equal in ≥ 70% of sampled disagreements" | Agreement alone is too crude — sample 30 disagreements per flow and a human (Jack or designated reviewer) marks each as `new better / equal / legacy better`. The 70% bar means new path is at least as good. |
| `repo_top_count > 0` rate on non-empty repos | ≥ 95% | Catch the "new path returns nothing for queries that should match" failure mode |
| No catch-side errors during shadow week | 0 unhandled `searchClientRepo` exceptions in 24h | Shadow path failures are caught + logged; if any escape into the agent flow, hold the flip |

If any threshold misses, the flip waits one more week and we tune (parser threshold, chunking strategy, similarity floor).

If after 4 weeks a flow still doesn't meet the bar, we open an explicit decision: ship the legacy path indefinitely for that flow, or invest more in retrieval quality.

### 5.2 Operational alerting

These exist before launch, not after a regression:

- **Pending backlog:** Grafana panel + PagerDuty (or Slack #ops) alert when `count(*) FROM client_repo_documents WHERE ingestion_status='pending' AND created_at < now() - interval '5 minutes'` > 0. Means cron isn't sweeping or batch is too small.
- **Failed-ingest rate:** alert if `count(*) WHERE ingestion_status='failed' AND created_at > now() - interval '1 hour'` > 5. Means a parser or upstream issue.
- **OCR fallback rate:** dashboard panel of `% of PDFs that hit OCR`. Sudden spike to 100% means `unpdf` regressed or the threshold drifted.
- **Janitor cron lag:** alert if rows with `deleted_at < now() - interval '35 days'` exist (janitor is supposed to reap at 30d).

---

## 6. Cost and capacity projections

### 6.1 Storage

**Reconciled with §7 R8 (1 GB hard cap):**

- Average client brand book sits at 30–80 MB based on observed real-world docs.
- Average per-client repo at maturity (with the 1 GB hard cap): up to 1 GB; realistic average ~400 MB.
- Supabase Pro: 100 GB included, $0.021/GB/month over.
- At 50 active clients × 400 MB avg = 20 GB. Inside included tier.
- At 50 active clients × 1 GB cap saturated = 50 GB. Still inside, with 50% headroom.
- At 100 clients × 1 GB = 100 GB — right at the line; would warrant adjusting the cap or moving to a higher Storage plan.

**Mitigation if we breach:** raise the soft warning to surface at 600 MB per client (currently 800 MB in R8) so admins prune before hitting the hard cap.

### 6.2 Egress

- Signed URLs for previews: ~50 MB/day per active admin session × 10 admins = 500 MB/day = ~15 GB/month. Inside included egress tier.

### 6.3 Embedding generation

- Gemini embedding 001 via Google AI Studio: free tier covers 1500 RPD.
- Each upload: ~10 chunks × 1 embedding each = ~10 RPD per upload.
- At 100 uploads/day = 1000 RPD. Inside free tier.
- Backfill spike: 50 clients × 10 chunks = 500 RPD one-shot. Spread over an hour to avoid free-tier burst limits.

### 6.4 OCR fallback

- Mistral OCR via OpenRouter: ~$0.001/page. Image-heavy brand book at 60 pages = $0.06.
- At 100 such uploads/year = $6/year. Negligible.

### 6.5 Cron compute

- One sweep every 60s claiming up to 5 docs. Each PDF parse averages 4s. Fluid Compute on Vercel: ~150ms billable per invocation idle plus active CPU time. Net ~$2/month at projected volume.

**Total incremental monthly cost at 50 clients: < $10.**

---

## 7. Risks and mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Parser quality on image-heavy PDFs is poor (extracted text is mush) | Med | Med | Auto-fallback to Mistral OCR when avg text per page < `OCR_FALLBACK_CHARS_PER_PAGE` (calibrated during planning, not the spec's provisional 80). Manually re-trigger via UI if a doc misroutes. |
| R2 | Embedding model swap requires re-embedding all docs | Low | Med | Same risk exists today for `client_knowledge_entries`; unchanged. |
| R3 | RLS bug leaks one client's docs to another | Low | High | Mirror the existing `topic_searches` RLS pattern verbatim (already proven). Add an integration test that asserts cross-client read returns 0 rows. |
| R4 | Cron sweep falls behind during a bulk upload spike | Med | Low | Sweep claims 5/min = 300/hour = 7,200/day capacity. If we exceed, bump batch size. **Operational alert** (§5.2) fires when pending > 0 for >5 min. |
| R5 | DOCX with embedded fonts loses styling fidelity | High | Low | Acceptable — agent only needs text. Original file preserved for human download. |
| R6 | OpenRouter rate-limits Mistral OCR mid-batch | Med | Low | Per-doc retry with exponential backoff; surface failure in UI with manual re-trigger. |
| R7 | Backfill script duplicates if re-run | Low | Med | Idempotent: skip if `client_repo_documents` already has a backfill row for that client. |
| R8 | Storage costs explode if a client uploads 50 GB of raw video | Low | High | Per-file size cap 80 MB enforced at upload. Per-client soft cap 1 GB; warn at 600 MB, block at 1 GB until support raises. |
| R9 | Shadow-mode logs explode the DB or leak PII | Med | Med | Cap retention to 14 days (janitor cron); store query hashes only, never plaintext. |
| R10 | Agent flow breaks during the parallel shadow period | Low | High | Shadow path is read-only and additive; failures in `searchClientRepo` are caught and logged, never thrown. Operational alert (§5.2) on uncaught exceptions. |
| R11 | Soft-deleted docs leak storage cost growth | Med | Low | Janitor cron reaps both rows AND storage objects after 30d. Alert if janitor falls behind. |
| R12 | OCR fallback threshold misroutes (text-rich docs flip to OCR / vice versa) | Med | Low | Calibrated against ≥5 real fixtures during planning, not picked from thin air. |
| R13 | Empty-repo new clients tank the shadow-mode agreement metric | High if not handled | Low | Shadow metric excludes queries where `repo_top_count = 0` AND the client has zero indexed chunks. |

---

## 8. Test strategy

### 8.1 Unit

- `searchClientRepo` with seeded fixtures: returns expected ordering for known queries.
- Parser pipeline with golden PDFs: known input → known markdown.
- Checksum dedup: re-uploading the same file is a no-op (or a "this file already exists" UI affordance).
- Chunker: documents with known heading structure → expected chunk boundaries.

### 8.2 Integration

- Upload → ingest → search end-to-end against a local Supabase instance, with cron sweep manually invoked.
- RLS: as `viewer` for client A, `select * from client_repo_documents where client_id = <client_b>` returns zero rows. Same for `client_repo_chunks` and storage.
- Backfill script runs cleanly against a snapshot of staging.
- Janitor reaps a soft-deleted row after `deleted_at < now() - interval '30 days'`, including the storage object.

### 8.3 E2E (Playwright)

Add to `tests/e2e`:

- Admin uploads a PDF on `/admin/clients/[slug]/repo`, sees ingestion go from "Parsing" to "Ready" within 60s, opens the side panel, sees markdown preview + matching chunk navigation.
- Search bar finds the document by a phrase that's only in the PDF body — and the snippet returned is the correct chunk, not the doc head.
- Soft-delete hides the row but it's recoverable via direct DB query (admin escape hatch). Hard-delete via `?confirm=<slug>` removes both row + storage object.

### 8.4 Smoke after deploy

Single Playwright spec that uploads one tiny `.txt` file and asserts the row appears in the list with `ingestion_status = 'done'` and at least one chunk row exists. Runs against preview deployments via the existing Playwright harness.

### 8.5 Test fixtures (commit to `tests/fixtures/repo/`)

| Fixture | Purpose |
|---|---|
| `text-rich.pdf` | A Wikipedia article PDF export (~10 pages, dense text). Validates `unpdf` happy path. |
| `image-heavy.pdf` | A real client brand book (RankPrompt or Goldback), heavy on layout + images. Validates OCR fallback trigger + Mistral OCR output. |
| `mixed.pdf` | A pitch deck (mostly slides w/ some text). Validates the boundary case for the OCR threshold. |
| `simple.docx` | A short brand-voice doc with headings + paragraphs. Validates `mammoth` + `turndown` pipeline. |
| `embedded-images.docx` | A DOCX with inline images. Validates that we extract text + drop images cleanly. |
| `tiny.txt` | One paragraph for the smoke test. |

Calibration of `OCR_FALLBACK_CHARS_PER_PAGE` (§3.4) uses the first three.

---

## 9. Definition of done

The launch checklist below is the gate before flipping shadow mode to production-default.

### 9.1 Schema & data

- [ ] Migration applied to staging + production.
- [ ] RLS policies verified via integration test (client A → cannot see client B), for both `client_repo_documents` AND `client_repo_chunks` AND storage.
- [ ] Backfill script run against production. Verification queries return zero.
- [ ] `is_admin()` helper confirmed present in production (was added in `040_security_hardening.sql`).

### 9.2 Routes & API

- [ ] All routes in §3.6 implemented, Zod-validated, auth-checked.
- [ ] `/api/cron/repo-ingest` registered in `vercel.json` at `*/1 * * * *` with `CRON_SECRET` auth.
- [ ] `/api/cron/repo-janitor` registered at `0 4 * * *` (daily 4am UTC) with `CRON_SECRET` auth.
- [ ] `searchClientRepo` returns < 200ms p95 for typical queries.
- [ ] Hard-delete path (`?hard=true`) verified to remove storage object + chunks + row in a single transaction.

### 9.3 UI

- [ ] `/admin/clients/[slug]/repo` ships behind no flag (admins see it immediately).
- [ ] `InfoClientRepoCard` swaps in for `InfoBrandDnaSlim` on the info page.
- [ ] Empty state on a fresh client repo reads cleanly and doesn't dead-end.
- [ ] Upload progress bar updates per file, not per batch.
- [ ] Sentence case audit on all new copy (per CLAUDE.md).

### 9.4 Observability

- [ ] All four operational alerts from §5.2 wired (pending backlog, failed-ingest rate, OCR fallback rate, janitor lag).
- [ ] `repo_shadow_log` writes are non-blocking AND store query hashes only (never plaintext).
- [ ] Per-flow agreement metrics dashboarded.
- [ ] Failed ingestions surface in `/admin/usage` with retry affordance.

### 9.5 Documentation

- [ ] `CLAUDE.md` adds a Client Repo section pointing at this spec.
- [ ] `docs/api-patterns.md` lists the new routes.
- [ ] `docs/database.md` adds the `client_repo_documents` and `client_repo_chunks` tables.
- [ ] Internal note for the team: how to upload, what categories mean, when to retrigger ingestion, how to hard-delete a client's data.

### 9.6 Rollout

- [ ] Two-week shadow period completed per flow; all four §5.1 thresholds met before each flip.
- [ ] Per-flow flips merged in the order listed in §5 (Nerd → agency-knowledge → topic-search → portal-facing).
- [ ] Legacy `searchKnowledge*` calls removed where the new path now answers.

---

## 10. Future / v2

- **AI-suggested categorization:** on upload, classify `category` automatically from filename + content sample.
- **Document versioning:** keep historical versions of the same document with a `parent_id` link; UI shows version history with diffs.
- **Portal exposure:** a curated "client view" of selected docs (e.g., the brand book) for the customer to download.
- **`BrandDNAView` retirement:** when the chunked-retrieval quality is fully proven across all flows, the bento-grid summary view can re-derive itself from the repo content instead of being a separate artifact. Drop the legacy `client_knowledge_entries` `brand_guideline` rows at that point.
- **Cross-client search:** for the admin team, a global search across all client repos to find precedents ("did any other client say X?"). Strict admin-only. Requires a privacy review — even admin-only cross-tenant search has a leak risk if the UI surfaces snippets without source attribution.
- **In-place markdown edits:** today, editing a doc means re-uploading. v2 could allow inline markdown edits with versioning.

---

## 11. Open questions

1. **Replace or augment `BrandDNAView`?** Is the bento-grid view something we want to keep as an auto-populated summary of the repo's contents (regenerated from markdown), or is it sunset entirely once the repo ships?
2. **Per-client storage limits.** Confirm the 1 GB hard cap with 600 MB warn — or eat the storage cost and let it grow?
3. **Portal access.** Do clients see the repo in the portal, or is it purely an internal agency surface? (v1 default: internal-only.)
4. **Should "logos" be its own first-class category, or just a tag on a generic "asset" category?** Affects whether `category` is an enum or free text. Spec currently picks enum + tags; if this question opens for v2, we'd need a category migration.
5. **What's the right primary CTA on a fresh empty repo — "Generate from website" (auto-create a brand-guideline.md by re-running the existing brand-DNA flow against the website), or pure "upload your first file"?**
6. **`OCR_FALLBACK_CHARS_PER_PAGE` calibration:** who runs the calibration during planning, against which fixtures, and what's the format of the result (a single number vs. a per-format table)?
7. **Manual review reviewer.** §5.1 specifies a human samples 30 disagreements per flow during shadow. Is that Jack, a designated reviewer, or rotated? Decision affects shadow timeline (a busy week of reviews can be a multi-day blocker).

---

## 12. Dependencies (new)

| Package | Purpose | License | Footprint |
|---|---|---|---|
| `unpdf` | PDF → text | MIT | ~80 KB, server-only |
| `mammoth` | DOCX → HTML | BSD-2 | ~200 KB, server-only |
| `turndown` | HTML → markdown | MIT | ~30 KB, server-only |

All three are server-only (used in the ingestion pipeline only) and don't bloat the client bundle. Mistral OCR uses the already-installed OpenRouter client — no new dep.

---

## 13. References

### 13.1 Existing code touched / referenced

- `lib/ai/embeddings.ts` — Gemini embedding helper. Reused as-is.
- `lib/knowledge/search.ts` — pattern to mirror for `lib/knowledge/repo.ts`.
- `lib/knowledge/search-supabase.ts` — Postgres-side helpers; same call pattern.
- `lib/knowledge/graph-queries.ts` — RPC call wrapper pattern.
- `lib/nerd/tools/knowledge.ts` + `lib/nerd/tools/agency-knowledge.ts` — first cutover targets.
- `supabase/migrations/040_security_hardening.sql` — defines `is_admin()`, reused in RLS.
- `supabase/migrations/082_knowledge_search_rpcs.sql` — semantic search RPC pattern.
- `app/api/clients/[id]/brand-dna/generate/route.ts` — existing brand-DNA generation endpoint we'll keep.
- `components/clients/settings/info-brand-dna-slim.tsx` — slot the new `InfoClientRepoCard` will replace.
- `components/brand-dna/brand-dna-view.tsx` — the bento-grid view; stays for v1, candidate for v2 retirement.
- `lib/portal/effective-access.ts` — auth-context helper used by every client-scoped route.

### 13.2 External

- Supabase Storage: <https://supabase.com/docs/guides/storage>
- pgvector: <https://github.com/pgvector/pgvector>
- `unpdf` (PDF→text): <https://github.com/unjs/unpdf>
- `mammoth.js` (DOCX→HTML): <https://github.com/mwilliamson/mammoth.js>
- `turndown` (HTML→markdown): <https://github.com/mixmark-io/turndown>
- Mistral OCR via OpenRouter: <https://openrouter.ai/mistralai/mistral-ocr-2503>

---

## 14. Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-04-24 | Single multi-tenant bucket vs. per-client buckets | RLS easier against one bucket with path-prefix; per-client migration is cheap if needed |
| 2026-04-24 | Stay on Supabase Storage, not Vercel Blob | Parity with rest of stack; no second auth surface |
| 2026-04-24 | Keep `client_knowledge_entries` indefinitely after migration | Backwards compat for any flow that hasn't switched |
| 2026-04-25 | Two-week shadow period before flipping defaults | Gives time to gather agreement metrics; matches the cadence of past internal launches |
| 2026-04-25 | OCR fallback in v1 (not deferred) | Image-heavy brand books are common enough to block ship without it |
| 2026-04-25 | Per-flow flip rather than global flip | Safer rollout; one bad flow doesn't take the launch down |
| 2026-04-25 | **Chunked embeddings in v1, not v1.5** | Whole-doc embeddings are a retrieval regression on long PDFs; shipping them would cause shadow mode to look worse than the legacy path even if the underlying repo is good |
| 2026-04-25 | **Hard-delete + janitor cron in v1** | Soft-delete-only would leak storage cost growth and break GDPR-style data-removal requests |
| 2026-04-25 | **Per-flow flip metric is multi-criteria, not just rank-agreement** | Agreement-rate alone is too crude; new path can be better even when rankings disagree. Manual review of disagreements is the corrective. |
| 2026-04-25 | **Hash query strings in `repo_shadow_log`** | Plaintext queries leak client PII; cardinality is what we need, not content |
| 2026-04-25 | **80 chars/page OCR threshold is provisional** | Picked by reasoning; must be calibrated against ≥5 real fixtures during planning before it lands in code |
| 2026-04-25 | **Storage per-file cap raised 50 → 80 MB** | Real-world brand books regularly land in the 30–80 MB band |
