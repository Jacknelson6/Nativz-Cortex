# Client Repo — design

**Status:** Planning-ready spec (Spec B). Implementation plan not yet written.

**Authors:** Jack + Claude.
**Started:** 2026-04-24. **Last revised:** 2026-04-25.

**Slot already prepared:** `components/clients/settings/info-brand-dna-slim.tsx`, the slim "Brand DNA" placeholder on `/admin/clients/[slug]/settings/info`. When this ships, that placeholder is swapped for `InfoClientRepoCard` and the dossier pill (when it returns, see [Open Questions](#open-questions)) renames from "Brand DNA" to "Repo".

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
- A new table `client_repo_documents` indexing every uploaded file with metadata, extracted markdown, and an embedding.
- An **upload + browse UI** at `/admin/clients/[slug]/repo` (full surface) and a slim `InfoClientRepoCard` swap on the info page.
- A **PDF/DOCX → markdown ingestion pipeline** triggered on upload. Cron-backed for retries; serverless function does the actual conversion.
- An **agent retrieval API** (`lib/knowledge/repo.ts → searchClientRepo`) returning ranked chunks with source-file references.
- **Backfill** of existing `brand_guideline` rows so flows that switch to the new search keep working without a content migration day.
- A **two-week shadow-mode period** where agents call both old + new retrieval and we log discrepancies before flipping the default.

### 2.2 Out of scope (v1, deferred to v2 unless flagged)

- Agent-driven file editing — admin upload-only. Editing is a re-upload.
- Per-file ACLs beyond client-scoped — no per-document share links.
- Portal-side visibility — admin-only first; a curated client-facing view ships if asked.
- Real-time collab / multi-cursor editing — markdown previews are read-only.
- Vercel Blob — staying on Supabase Storage for parity.
- Replacing `BrandDNAView` on `/settings/brand` — that bento-grid stays. Only the info-page slim placeholder swaps in v1.
- Versioning / diff viewer for documents.
- AI-suggested category routing on upload.

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

**Why a single bucket vs. one per client:** Supabase Storage allows ~hundreds of buckets per project but RLS is more legible against a single bucket with path-prefix checks than against bucket existence. A migration to per-client buckets is cheap if RLS feels brittle in practice.

**Bucket settings:** private, no public URL, served via signed URLs (5-minute TTL) for previews. Max file size 50 MB per upload (matches Supabase Storage's default for paid tier; configurable to 5 GB if needed).

**RLS sketch:**

```sql
-- Read: admin always; viewer if their org owns this client
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

`is_admin()` is the existing helper used across the codebase.

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
  embedding vector(768),                       -- gemini-embedding-001 dim, matches client_knowledge_entries
  extraction_metadata jsonb default '{}'::jsonb, -- { parser, page_count, char_count, image_count, ... }

  -- Lifecycle
  ingestion_status repo_ingestion_status default 'pending',
  ingestion_error text,
  ingestion_retries smallint default 0,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz                       -- soft delete
);

create index client_repo_documents_client_idx
  on client_repo_documents (client_id, created_at desc)
  where deleted_at is null;

create index client_repo_documents_pending_idx
  on client_repo_documents (created_at)
  where ingestion_status = 'pending';

create index client_repo_documents_embedding_idx
  on client_repo_documents using ivfflat (embedding vector_cosine_ops)
  where deleted_at is null and embedding is not null;

create index client_repo_documents_checksum_idx
  on client_repo_documents (client_id, checksum)
  where deleted_at is null;

alter table client_repo_documents enable row level security;

create policy admin_all on client_repo_documents for all using (is_admin(auth.uid()));

create policy viewer_select on client_repo_documents for select using (
  client_id in (
    select client_id from user_client_access where user_id = auth.uid()
  )
);

-- Trigger updated_at on row update
create trigger client_repo_documents_set_updated_at
  before update on client_repo_documents
  for each row execute function set_updated_at();
```

### 3.3 Retrieval RPC

Modeled on the existing `search_knowledge_semantic` (see `supabase/migrations/082_knowledge_search_rpcs.sql`).

```sql
create or replace function search_client_repo(
  client_id_in uuid,
  query_embedding vector(768),
  match_count int default 8,
  category_filter repo_document_category[] default null
)
returns table (
  document_id uuid,
  filename text,
  category repo_document_category,
  snippet text,
  similarity float,
  storage_path text
)
language sql stable as $$
  select
    d.id as document_id,
    d.filename,
    d.category,
    -- naïve snippet: first 480 chars of markdown_content; v1.5 swap to chunked snippets
    coalesce(left(d.markdown_content, 480), '') as snippet,
    1 - (d.embedding <=> query_embedding) as similarity,
    d.storage_path
  from client_repo_documents d
  where d.client_id = client_id_in
    and d.deleted_at is null
    and d.embedding is not null
    and (category_filter is null or d.category = any(category_filter))
  order by d.embedding <=> query_embedding
  limit match_count;
$$;
```

For v1 we embed *whole-document* content. v1.5 splits long documents into ~500-token chunks with their own embeddings (a `client_repo_chunks` child table) so the snippets reflect the matching passage instead of the whole doc head.

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
4. **PDF — image-heavy fallback:** Mistral OCR via OpenRouter (already wired). Triggered when `unpdf` returns < 80 chars per page averaged across the document. Cost ~$0.001/page; acceptable for the long tail of design-heavy brand books.

**Trigger mechanism:**

- Sync path: API route writes the row with `ingestion_status='done'` + `markdown_content` + `embedding` populated inline.
- Async path: API route writes the row with `ingestion_status='pending'`, returns 202. A cron job at `/api/cron/repo-ingest` sweeps every 60s, claims up to 5 pending rows in a single transaction (`update ... where status='pending' returning ...`), processes them, writes back. Failures bump `ingestion_retries`; after 3 failures the row goes to `ingestion_status='failed'` with `ingestion_error` populated.

**Embedding generation:** reuse `lib/ai/embeddings.ts → embedText()`. Same `gemini-embedding-001` model, same 768 dim — so the column type matches `client_knowledge_entries.embedding` exactly and a future migration could merge tables if we wanted.

### 3.5 Retrieval API

```ts
// lib/knowledge/repo.ts
export interface RepoSearchResult {
  documentId: string;
  filename: string;
  category: 'guideline' | 'logo' | 'font' | 'reference' | 'contract' | 'misc';
  snippet: string;          // first ~480 chars of matching markdown (v1)
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

Implementation: embed `query` via `embedText()`; call `search_client_repo` RPC. Mirrors `searchKnowledge*` in shape so swapping call sites is mechanical.

### 3.6 HTTP API

| Method | Path | Purpose | Body / Query | Returns |
|---|---|---|---|---|
| `POST` | `/api/clients/[id]/repo/upload` | Upload one or more files | `multipart/form-data`: `files[]`, optional `category` per file | `{ documents: Array<{ id, filename, ingestion_status }> }` |
| `GET` | `/api/clients/[id]/repo` | List documents | `?category=...&limit=...&cursor=...` | `{ documents: Doc[], next_cursor }` |
| `GET` | `/api/clients/[id]/repo/[docId]` | Fetch single doc with markdown + signed url | — | `{ id, ..., markdown_content, signed_url }` |
| `PATCH` | `/api/clients/[id]/repo/[docId]` | Rename, recategorize, retag, retrigger ingestion | `{ filename?, category?, tags?, retrigger_ingestion? }` | Updated row |
| `DELETE` | `/api/clients/[id]/repo/[docId]` | Soft delete | — | `204` |
| `POST` | `/api/cron/repo-ingest` | Sweep pending rows | (vercel cron auth) | `{ processed: n, failed: n }` |
| `GET` | `/api/clients/[id]/repo/search` | Server-side proxy for `searchClientRepo` (used by admin search bar) | `?q=...&category=...` | `RepoSearchResult[]` |

All routes:

- **Auth:** `supabase.auth.getUser()` → fail 401 if no user.
- **Authz:** for admin routes, `is_admin` check; for viewer-readable routes, `getEffectiveAccessContext` + filter by `clientIds`.
- **Validation:** Zod schemas at the top of each route.
- **Errors:** `{ error: string, hint?: string }` with appropriate status codes.

### 3.7 UI surfaces

#### 3.7.1 Full surface — `/admin/clients/[slug]/repo`

Wireframe (text):

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
│  │  Drop files here or click to browse · max 50 MB per file                │ │
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
- `RepoDocumentSidePanel` — slide-in from the right with markdown preview, file metadata, actions (rename, recategorize, redownload, retrigger ingestion, delete).
- `RepoSearchBar` — top-right search box that posts to `/api/clients/[id]/repo/search` and highlights matching rows.

Reuses the existing `InfoCard` chrome where appropriate; no new design system primitives needed.

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
// pseudo
for each client where exists brand_guideline in client_knowledge_entries:
  read the latest brand_guideline row (content, embedding, metadata, updated_at)
  upload synthetic file to client-repo/<clientId>/<docId>.md with the markdown content
  insert into client_repo_documents (
    client_id, storage_path, filename = 'brand-guideline.md',
    mime_type = 'text/markdown', size_bytes = byte_length(content),
    checksum = sha256(content), category = 'guideline',
    markdown_content = content, embedding = embedding,
    extraction_metadata = { source: 'backfill', original_entry_id, original_updated_at },
    ingestion_status = 'done',
    uploaded_by = (a system user uuid)
  )
```

**Verification queries** to run after the script:

```sql
-- Every client with a brand_guideline now has a repo doc.
select c.id, c.name
from clients c
where exists (select 1 from client_knowledge_entries
              where client_id = c.id and type = 'brand_guideline'
              and metadata->>'superseded_by' is null)
  and not exists (select 1 from client_repo_documents
                  where client_id = c.id
                  and category = 'guideline'
                  and extraction_metadata->>'source' = 'backfill');

-- Embeddings carried over (no nulls where there was a brand_guideline).
select count(*) from client_repo_documents
where extraction_metadata->>'source' = 'backfill' and embedding is null;
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

Phased over ~4 weeks:

| Week | Phase | Action |
|---|---|---|
| 0 | Ship | Deploy schema + routes + UI + `searchClientRepo`. No agent changes. Backfill runs. |
| 1–2 | Shadow | Update each agent flow that calls `searchKnowledge*` to ALSO call `searchClientRepo` for the same query, log both result sets to a new `repo_shadow_log` table. UI/agent uses the legacy result. |
| 3 | Compare | Review `repo_shadow_log`: how often did the new path return better/worse/equal results? Where did it fail? |
| 4 | Flip | If quality is on par or better, flip the default. Drop the legacy `searchKnowledge*` calls in flipped flows. |

**Shadow log schema:**

```sql
create table repo_shadow_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  query text not null,
  legacy_top_id uuid,                    -- knowledge_entries.id
  legacy_top_similarity float,
  repo_top_id uuid,                      -- client_repo_documents.id
  repo_top_similarity float,
  agreed boolean,                        -- did both rank the same source #1
  flow text not null,                    -- 'topic_search', 'ideation', etc.
  created_at timestamptz default now()
);
```

**Comparison metric:** % of queries where `agreed=true`, broken down by `flow`. Target ≥ 70% before flipping. Discrepancies (`agreed=false`) get manual review and either inform a parser tweak or confirm the new path is genuinely better.

---

## 6. Cost and capacity projections

### 6.1 Storage

- Average client brand book: ~5–20 MB.
- Average per-client repo at maturity: ~100–500 MB (assume 25 docs averaging 10 MB).
- Supabase Pro plan: 100 GB included, $0.021/GB/month over.
- At 50 active clients × 500 MB = 25 GB. Comfortably inside the included tier. No new cost line.

### 6.2 Egress

- Signed URLs for previews: ~50 MB/day per active admin session × 10 admins = 500 MB/day = ~15 GB/month. Inside the included egress tier.

### 6.3 Embedding generation

- Gemini embedding 001 via Google AI Studio: free tier covers 1500 RPD. Each upload generates 1 embedding (whole-doc in v1; ~10 chunks in v1.5). Even at 100 uploads/day we're inside free tier.

### 6.4 OCR fallback

- Mistral OCR via OpenRouter: ~$0.001/page. Image-heavy brand book at 60 pages = $0.06. At 100 such uploads/year = $6/year. Negligible.

### 6.5 Cron compute

- One sweep every 60s claiming up to 5 docs. Each PDF parse averages 4s. Fluid Compute on Vercel: ~150 ms billable per invocation idle, plus active CPU time. Net ~$2/month at projected volume.

**Total incremental monthly cost at 50 clients: < $10.**

---

## 7. Risks and mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Parser quality on image-heavy PDFs is poor (extracted text is mush) | Med | Med | Auto-fallback to Mistral OCR when avg text per page < 80 chars. Manually re-trigger via UI. |
| R2 | Embedding model swap requires re-embedding all docs | Low | Med | Same risk exists today for `client_knowledge_entries`; unchanged. |
| R3 | RLS bug leaks one client's docs to another | Low | High | Mirror the existing `topic_searches` RLS pattern verbatim (already proven). Add an integration test that asserts cross-client read returns 0 rows. |
| R4 | Cron sweep falls behind during a bulk upload spike | Med | Low | Sweep claims 5/min = 300/hour = 7,200/day capacity. If we exceed, bump batch size or shift to Supabase Edge Function on insert. |
| R5 | DOCX with embedded fonts loses styling fidelity | High | Low | Acceptable — agent only needs text. Original file preserved for human download. |
| R6 | OpenRouter rate-limits Mistral OCR mid-batch | Med | Low | Per-doc retry with exponential backoff; surface failure in UI with manual re-trigger. |
| R7 | Backfill script duplicates if re-run | Low | Med | Idempotent: skip if `client_repo_documents` already has a row with `extraction_metadata->>'source' = 'backfill'` for that client. |
| R8 | Storage costs explode if a client uploads 50 GB of raw video | Low | High | Per-file size cap 50 MB enforced at upload. Per-client soft cap 1 GB; warn at 800 MB, block at 1 GB until support raises. |
| R9 | Shadow-mode logs explode the DB | Low | Low | Cap retention to 14 days; auto-purge via daily cron. |
| R10 | Agent flow breaks during the parallel shadow period | Low | High | Shadow path is read-only and additive; failures in `searchClientRepo` are caught and logged, never thrown. |

---

## 8. Test strategy

### 8.1 Unit

- `searchClientRepo` with seeded fixtures: returns expected ordering for known queries.
- Parser pipeline with golden PDFs: known input → known markdown.
- Checksum dedup: re-uploading the same file is a no-op (or a "this file already exists" UI affordance).

### 8.2 Integration

- Upload → ingest → search end-to-end against a local Supabase instance, with cron sweep manually invoked.
- RLS: as `viewer` for client A, `select * from client_repo_documents where client_id = <client_b>` returns zero rows.
- Backfill script runs cleanly against a snapshot of staging.

### 8.3 E2E (Playwright)

Add to `tests/e2e`:

- Admin uploads a PDF on `/admin/clients/[slug]/repo`, sees ingestion go from "Parsing" to "Ready" within 60s, opens the side panel, sees markdown preview.
- Search bar finds the document by a phrase that's only in the PDF body.
- Soft-delete hides the row but it's recoverable via direct DB query (admin escape hatch).

### 8.4 Smoke after deploy

Single Playwright spec that uploads one tiny `.txt` file and asserts the row appears in the list with `ingestion_status = 'done'`. Runs against preview deployments via the existing Playwright harness.

---

## 9. Definition of done

The launch checklist below is the gate before flipping shadow mode to production-default.

### 9.1 Schema & data

- [ ] Migration applied to staging + production (`supabase/migrations/<next>_client_repo_documents.sql`).
- [ ] RLS policies verified via integration test (client A → cannot see client B).
- [ ] Backfill script run against production. Verification queries return zero.

### 9.2 Routes & API

- [ ] All routes in §3.6 implemented, Zod-validated, auth-checked.
- [ ] `/api/cron/repo-ingest` registered in `vercel.json` (or `vercel.ts`) at `*/1 * * * *`.
- [ ] `searchClientRepo` returns < 200ms p95 for typical queries.

### 9.3 UI

- [ ] `/admin/clients/[slug]/repo` ships behind no flag (admins see it immediately).
- [ ] `InfoClientRepoCard` swaps in for `InfoBrandDnaSlim` on the info page.
- [ ] Empty state on a fresh client repo reads cleanly and doesn't dead-end.
- [ ] Upload progress bar updates per file, not per batch.

### 9.4 Observability

- [ ] `repo_shadow_log` writes are non-blocking (failure to log doesn't break a search).
- [ ] Per-flow agreement metrics dashboarded (Grafana or our existing analytics).
- [ ] Failed ingestions surface in `/admin/usage` with retry affordance.

### 9.5 Documentation

- [ ] `CLAUDE.md` adds a Client Repo section pointing at this spec.
- [ ] `docs/api-patterns.md` lists the new routes.
- [ ] `docs/database.md` adds the `client_repo_documents` table.
- [ ] Internal note for the team: how to upload, what categories mean, when to retrigger ingestion.

### 9.6 Rollout

- [ ] Two-week shadow period completed; agreement metric ≥ 70% per flow.
- [ ] Per-flow flip merged. Legacy `searchKnowledge*` calls removed where the new path now answers.

---

## 10. Future / v2

- **Chunked embeddings:** split long docs into ~500-token chunks with their own embeddings + a `client_repo_chunks` child table. Snippet retrieval becomes passage-level instead of doc-level.
- **AI-suggested categorization:** on upload, classify `category` automatically from filename + content sample.
- **Document versioning:** keep historical versions of the same document with a `parent_id` link; UI shows version history with diffs.
- **Portal exposure:** a curated "client view" of selected docs (e.g., the brand book) for the customer to download.
- **`BrandDNAView` retirement:** when chunked embeddings are good enough, the bento-grid summary view can re-derive itself from the repo content instead of being a separate artifact.
- **Cross-client search:** for the admin team, a global search across all client repos to find precedents ("did any other client say X?"). Strict admin-only.

---

## 11. Open questions

1. **Replace or augment `BrandDNAView`?** Is the bento-grid view something we want to keep as an auto-populated summary of the repo's contents (regenerated from markdown), or is it sunset entirely once the repo ships?
2. **Per-client storage limits.** Soft-cap at 1 GB / hard at 5 GB? Or eat the storage cost and let it grow?
3. **Portal access.** Do clients see the repo in the portal, or is it purely an internal agency surface? (v1 default: internal-only.)
4. **Ingestion priority during launch.** Ship `unpdf`-only initially and accept sparse extraction on image-heavy brand books, or block ship on the OCR fallback being fully wired?
5. **Dossier pill rename.** When this ships, the dossier pill (currently removed from the info page; see commit `3253eedb`) gets renamed from "Brand DNA" to "Repo" if/when the dossier returns. Decision to make at that point.
6. **Should "logos" be its own first-class category or just a tag?** Affects whether `category` is an enum or free text.
7. **What's the right primary CTA on a fresh empty repo — "Generate from website" (auto-create a brand-guideline.md by re-running the existing brand-DNA flow against the website), or pure "upload your first file"?**

---

## 12. References

### 12.1 Existing code touched / referenced

- `lib/ai/embeddings.ts` — Gemini embedding helper. Reused as-is.
- `lib/knowledge/search.ts` — pattern to mirror for `lib/knowledge/repo.ts`.
- `lib/knowledge/graph-queries.ts` — RPC call wrapper pattern.
- `supabase/migrations/082_knowledge_search_rpcs.sql` — semantic search RPC pattern.
- `app/api/clients/[id]/brand-dna/generate/route.ts` — existing brand-DNA generation endpoint we'll keep.
- `components/clients/settings/info-brand-dna-slim.tsx` — slot the new `InfoClientRepoCard` will replace.
- `components/brand-dna/brand-dna-view.tsx` — the bento-grid view; stays for v1, candidate for v2 retirement.
- `lib/portal/effective-access.ts` — auth-context helper used by every client-scoped route.

### 12.2 External

- Supabase Storage: <https://supabase.com/docs/guides/storage>
- pgvector: <https://github.com/pgvector/pgvector>
- `unpdf` (PDF→text): <https://github.com/unjs/unpdf>
- `mammoth.js` (DOCX→HTML): <https://github.com/mwilliamson/mammoth.js>
- `turndown` (HTML→markdown): <https://github.com/mixmark-io/turndown>
- Mistral OCR via OpenRouter: <https://openrouter.ai/mistralai/mistral-ocr-2503>

---

## 13. Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-04-24 | Single multi-tenant bucket vs. per-client buckets | RLS easier against one bucket with path-prefix; per-client migration is cheap if needed |
| 2026-04-24 | Whole-doc embeddings in v1; chunked in v1.5 | Ship retrieval at all before optimizing snippet quality |
| 2026-04-24 | Stay on Supabase Storage, not Vercel Blob | Parity with rest of stack; no second auth surface |
| 2026-04-24 | Keep `client_knowledge_entries` indefinitely after migration | Backwards compat for any flow that hasn't switched |
| 2026-04-25 | Shadow-mode period of 2 weeks before flipping defaults | Gives time to gather agreement metrics; matches the cadence of past internal launches |
| 2026-04-25 | OCR fallback in v1 (not deferred) | Image-heavy brand books are common enough to block ship without it |
| 2026-04-25 | Per-flow flip rather than global flip | Safer rollout; one bad flow doesn't take the launch down |
