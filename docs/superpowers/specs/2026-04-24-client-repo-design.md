# Client Repo — design

**Status:** Brainstorm-quality spec (Spec B). Not yet planned for implementation.

**Author:** Jack + Claude (2026-04-24).

**Slot already prepared in:** `components/clients/settings/info-brand-dna-slim.tsx` (the slim "Brand DNA" placeholder card on `/admin/clients/[slug]/settings/info`). When this ships, that placeholder is swapped for `InfoClientRepoCard` and the dossier pill renames to "Repo (12 files · 2d ago)".

---

## What we're solving

Today, a client's brand intelligence is split between:

- **Structured fields** on the `clients` table (voice, audience, keywords, tagline, products, etc.) — edited via the new info page (commits `b70cf874` … `71456aea`).
- **Brand DNA artifact** stored in `client_knowledge_entries` (a single AI-distilled markdown blob with bento-grid metadata).
- **Loose assets** that live in Google Drive folders linked from the brand settings (`google_drive_branding_url`, `google_drive_calendars_url`).
- **PDF brand books** that get pasted into Notion or attached to email threads — never landing inside Cortex at all.

Every agent (topic search, ideation, ad creative, nerd, etc.) that wants the "real" brand context has to either:

1. Hope the structured fields are filled out (often partial, manually maintained).
2. Run a multimodal call against a website or PDF every time it needs to look something up.
3. Fall back to vague guesses.

**Jack's instinct (paraphrased):** "Make Brand DNA irrelevant. Replace it with a Supabase repo per client — branding guidelines, uploaded PDFs converted to markdown, everything super easily accessible for our agents so we don't have to multimodal every call. Logos stay as images so they preserve their look."

The goal is a **per-client knowledge filesystem** that:

- **Holds the source files** (PDFs, DOCX, images, brand books, contracts) so they live inside the agency tool and not in someone's Drive.
- **Auto-extracts plain text** from anything textual (PDF → markdown, DOCX → markdown) so agents do cheap embedding-similarity retrieval instead of multimodal-on-every-call.
- **Preserves images / logos as files** so they're available when an agent genuinely needs the visual.
- **Becomes the single retrieval surface** — agents stop dipping into `client_knowledge_entries` for unstructured context and stop scraping the website on every flow. Structured fields stay where they are; the repo is for the long tail.

---

## Scope

### In scope (v1)

- One **Supabase Storage bucket** for client repo files: `client-repo` (private, RLS-scoped by `client_id` matching the path prefix).
- A new table `client_repo_documents` that indexes every uploaded file with metadata, extracted markdown, and an embedding.
- An **upload + browse UI** on `/admin/clients/[slug]/repo` (full surface) and a slim `InfoClientRepoCard` on the info page.
- A **PDF/DOCX → markdown ingestion pipeline** triggered on upload. Cron-backed for retries; serverless function does the actual conversion.
- An **agent retrieval API**: `lib/knowledge/repo.ts → searchClientRepo(clientId, query, opts)` returning ranked chunks with source file references.
- **Backfill** of the existing `client_knowledge_entries` `brand_guideline` rows into the repo as one document per client (so agents that switch to the new search keep working).
- The slim info-page card renders status (`12 files · 2d ago` / `empty`) + a primary CTA to the full repo page.

### Out of scope (v1)

- Agent-driven file editing — files are upload-only from the admin side. Editing is a re-upload.
- Per-file ACLs beyond client-scoped — no per-document share links yet.
- Portal-side visibility of the repo — admin-only first; a curated "client deliverable" view ships later if asked.
- Real-time collaboration / multi-cursor editing — markdown previews are read-only.
- Vercel Blob — we stay on Supabase Storage for parity with the rest of the stack.
- Replacing the Brand DNA bento-grid view on the standalone `/settings/brand` page. That stays. The info-page slim placeholder gets the swap; the canonical brand-profile bento isn't deleted until v2.

---

## Architecture

### Storage layout

Single bucket, multi-tenant, private:

```
client-repo/
  <client_id>/
    <document_id>.<ext>          # original upload, immutable
    <document_id>.images/        # extracted images from PDFs (optional, v1.5)
      page-<n>.png
```

RLS policy on the bucket: only authenticated users can read/write within `<client_id>/` if they're an admin OR a viewer scoped to that client (matches existing portal RLS pattern). Writes additionally require an admin role.

### Database schema

```sql
-- supabase/migrations/<next>_client_repo_documents.sql
create table client_repo_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  storage_path text not null,                 -- bucket-relative path
  filename text not null,                     -- display name
  mime_type text not null,
  size_bytes integer not null,
  category text default 'misc',               -- 'guideline' | 'logo' | 'reference' | 'misc'
  markdown_content text,                      -- null for non-textual files (logos)
  embedding vector(768),                      -- gemini-embedding-001 dim, matches client_knowledge_entries
  metadata jsonb default '{}'::jsonb,         -- { source_url, page_count, extraction_model, ... }
  ingestion_status text default 'pending',    -- 'pending' | 'processing' | 'done' | 'failed' | 'skipped'
  ingestion_error text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index client_repo_documents_client_idx on client_repo_documents (client_id, created_at desc);
create index client_repo_documents_embedding_idx
  on client_repo_documents using ivfflat (embedding vector_cosine_ops);

alter table client_repo_documents enable row level security;
-- admin: all; viewer: scoped via user_client_access (matches existing pattern)
```

Plus a Postgres RPC `search_client_repo(client_id_in uuid, query_embedding vector, match_count int)` modeled on the existing `search_knowledge_semantic`.

### Ingestion pipeline

Two paths:

1. **Synchronous quick-path** (text-only formats: `.md`, `.txt`, small `.docx`): convert + embed inline during upload, mark `ingestion_status = 'done'`.
2. **Async path** (`.pdf`, large `.docx`, anything > a few MB): write the row with `ingestion_status = 'pending'`, kick off processing via either a Supabase Edge Function trigger on insert OR a cron sweep `/api/cron/repo-ingest` that processes pending rows in batches.

Parser choice (decide during planning):

- **First pick: `unpdf`** (pure JS, no native deps, runs on Vercel Functions). Good for mostly-text PDFs.
- **Fallback: Mistral OCR via OpenRouter** for image-heavy PDFs where `unpdf` returns sparse text. Already paying for OpenRouter; no new dependency.
- **DOCX**: `mammoth.js` → markdown. Pure JS.

Image extraction (v1.5): `pdf2pic` writes per-page PNGs into the `<document_id>.images/` folder; markdown references them by relative path. Optional in v1.

### Retrieval API

```ts
// lib/knowledge/repo.ts
export async function searchClientRepo(
  clientId: string,
  query: string,
  opts?: { limit?: number; minSimilarity?: number; categories?: string[] },
): Promise<Array<{
  documentId: string;
  filename: string;
  category: string;
  snippet: string;       // best-matching chunk
  similarity: number;
  storagePath: string;   // for "view source" link
}>>
```

Implementation: embed `query` via the existing `lib/ai/embeddings.ts` Gemini pipeline; call `search_client_repo` RPC. Mirrors `searchKnowledge*` in shape so swapping call sites is mechanical.

### UI

**Full surface — `/admin/clients/[slug]/repo`:**

- Drop-zone at top (drag a file or click to upload, multi-file).
- File list grouped by category (Guidelines / Logos / References / Misc), each row showing icon by mime type, filename, size, ingestion status, "Open" / "Download" / "Delete" actions.
- Click a row → side panel with markdown preview (text files) or image preview (logos).
- Per-document: rename, change category, see ingestion error if failed, manually re-trigger ingestion.

**Slim card on info page — `InfoClientRepoCard`** (replaces `InfoBrandDnaSlim`):

- Status: `12 files · last upload 2d ago` (or `empty` with upload CTA).
- Three most-recent files as a compact list with deep-link to the full repo.
- Single primary CTA: "Open repo →".
- Reuses the same `InfoCard` chrome.

**Dossier pill swap:** the existing "Brand DNA" pill becomes "Repo (12 · 2d ago)" with the same deep-link.

### Migration

- New migration: `client_repo_documents` table + RLS + RPC + storage bucket.
- One-shot script: `scripts/backfill-client-repo.ts` reads every row in `client_knowledge_entries` where `type = 'brand_guideline'`, writes the markdown content to a `<client_id>/brand-guideline.md` storage path, inserts a `client_repo_documents` row with `category = 'guideline'`, copies over the existing embedding (no re-embed needed since it's the same Gemini model).
- Old `client_knowledge_entries` rows kept indefinitely so any consumer that hasn't migrated still works.

### Agent integration cutover

Phased:

1. Ship the repo + ingestion + UI, no agent changes. Repo lives in parallel with current systems.
2. Update topic search / ideation / nerd to call `searchClientRepo` *in addition to* their current `searchKnowledge*` calls. Compare results in shadow mode; log discrepancies.
3. Once retrieval quality is verified, flip flows to call `searchClientRepo` only. Drop the parallel `searchKnowledge*` calls.

---

## Risks & decisions to revisit

- **Parser quality on image-heavy PDFs.** `unpdf` will produce mush for design-heavy brand books. The Mistral OCR fallback adds cost and latency. Decide threshold (`if extracted text length / page < N → fallback`).
- **Embedding model coupling.** The repo embedding column is `vector(768)` to match Gemini-embedding-001. If we ever swap embedding models, we re-embed everything; same cost as the existing `client_knowledge_entries` would face.
- **Storage bucket vs file-per-bucket.** Single multi-tenant bucket is simpler ops-wise but RLS gets fiddly. If RLS feels brittle during planning, switch to per-client buckets (Supabase Storage allows programmatic bucket creation).
- **DOCX fidelity.** `mammoth.js` is fine for prose-heavy docs but loses styling. Acceptable for v1 since the agent only needs the text.
- **Backwards compat with `BrandDNAView`.** The bento-grid card on `/admin/brand-profile` still reads from `client_knowledge_entries`. We keep that working until v2; the repo is additive.
- **Portal exposure.** v1 is admin-only. If the portal needs read access later, reuse the RLS pattern from `topic_searches`.

---

## What this unlocks

- Agents stop multimodal-scraping the website on every call — text retrieval against the repo is orders of magnitude cheaper.
- Brand managers stop emailing PDFs around — they upload once, every flow has it.
- The "Brand DNA generation" wizard becomes optional decoration; the repo is the source of truth.
- A "Generate brand essence from repo" button replaces "Generate from website" — same UX, smarter source.

---

## Open questions for Jack before planning

1. **Replace or augment Brand DNA?** Is the bento-grid `BrandDNAView` something we want to keep as a pretty summary view of the repo's contents (auto-populated from extraction), or is the bento-grid sunset entirely?
2. **Per-client storage limits?** Some brand books are 100 MB. Do we cap repo size at say 1 GB / client, or eat the storage cost?
3. **Portal access?** Do clients ever see the repo, or is it purely an internal agency surface?
4. **Ingestion priority during launch?** If we ship parser as `unpdf`-only initially and a client uploads a heavily designed brand book, the extraction will be sparse. Acceptable as a v1 limitation, or block ship on the OCR fallback?
