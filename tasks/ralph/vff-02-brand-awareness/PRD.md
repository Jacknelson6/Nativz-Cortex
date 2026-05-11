# PRD: VFF · 02 · Brand-aware ingestion signals

> Viral Format Finder · 02/10 · 2026-05-10

## Purpose & Value

Decide which formats matter to which brand before scraping a single video. A travel brand and a SaaS brand should not see the same TikTok format library. This PRD introduces a per-brand context row (`brand_format_context`) holding seed terms, reference creator handles, pillar weights, tone descriptors, an excluded-terms list, and a Gemini embedding of the merged seed signal. Downstream ingestion (VFF-03), gating (VFF-04), and ranking (VFF-08) all read this row.

## Problem

A format library that ignores brand is just a TikTok trending page with extra steps. The strategist's job is "what works for THIS brand right now," not "what is viral globally." Without a brand-aware filter, every row is noise and the surface fails its job in 30 seconds.

## Primary User

Internal strategists. Indirectly the ingestion + ranking pipelines.

## SMART Goals

- 100% of active, non-paused brands have a populated `brand_format_context` row within 24h of this PRD shipping.
- The helper `getBrandFormatSeeds(clientId)` returns >=5 seed terms and >=3 reference creators for >=90% of active brands.
- Brand cosine similarity smoke test: `scripts/smoke-format-relevance.ts` reports cosine >=0.6 between a brand's seed embedding and a hand-tagged on-brand video embedding.
- Nightly recompute cron completes in <=120s for the current brand count (~30 brands today).

## User Stories

- **US-01** — As a strategist, when I open `/admin/formats?brand=<id>`, the rows beneath are visibly seeded by that brand's profile (not a global trending feed).
- **US-02** — As a strategist, I can edit a brand's format seeds inline from `/admin/clients/[id]/brand-profile` when auto-extracted ones are wrong, and the change shows up in the next scrape.
- **US-03** — As an admin debugging a recommendation, I can `select * from brand_format_context where client_id = ...` and see exactly which seeds, creators, weights, and exclusions drove the result.
- **US-04** — As the system, when a brand has never had context computed (new client) the cron picks it up on its next pass without manual triggering.

## In Scope

- Migration 274 introducing `brand_format_context` table + RLS.
- Helper `lib/analytics/brand-format-context.ts` exporting `getBrandFormatSeeds(clientId)`, `upsertBrandFormatContext(payload)`, `computeBrandFormatContext(clientId)`.
- Cron route `app/api/cron/recompute-format-context/route.ts` (daily 04:30 UTC) iterating active brands, calling `computeBrandFormatContext`, writing the row.
- Manual override UI: section on `/admin/clients/[id]/brand-profile` for editing seeds + excluded terms + reference creators.
- API routes `GET` and `PATCH /api/admin/clients/[id]/format-context`.
- Embedding column populated via Gemini Embedding 001 from existing `lib/ai/embeddings.ts`.
- Smoke script `scripts/smoke-format-relevance.ts`.

## Out of Scope

- Actually surfacing the formats (VFF-07).
- Re-embedding the video corpus when context changes; per-video embeddings live on `viral_videos` (VFF-05) and are independent.
- Auto-tuning `excluded_terms` from low-relevance user actions (deferred to a learning loop v2).
- Portal exposure (admin-only v1).

## Resolved Decisions

- **D-01** — Manual or auto-derived `excluded_terms`? **→ Manual only v1.** Rationale: avoids false negatives early; learning loop deferred.
- **D-02** — Per-platform handle lists or one flat list? **→ Per-platform JSON `{ tiktok: [...], instagram: [...], youtube: [...] }`.** Rationale: creator overlap across platforms is low and the ingestion cron queries per-platform anyway.
- **D-03** — Cap on `seed_terms`? **→ 25 hard cap, soft warning at 20.** Rationale: marginal signal drops fast past 20; protects embedding quality.
- **D-04** — One row per brand or versioned history? **→ One row per brand, overwrite on recompute, keep `last_recomputed_at`.** Rationale: history adds storage without obvious product value; ranking only needs current row.
- **D-05** — Where does the LLM extraction prompt live? **→ `lib/analytics/brand-format-context.ts` (server-only).** Rationale: keeps prompt + parsing co-located with the cron + helpers; matches existing pattern in `lib/audit/analyze.ts`.
- **D-06** — What signals feed the auto-extraction? **→ `clients.name`, `clients.industry`, `clients.services`, `clients.caption_notes`, and any `topic_plans.plan_json.pillars` from the most recent 3 plans.** Rationale: these are the highest-signal columns already populated for most active brands; `brand_profiles`/`content_pillars` tables do not exist yet per CONTEXT.md.
- **D-07** — How are reference creator handles seeded the first time? **→ LLM proposes from auto-extraction; strategist confirms in override UI.** Rationale: cheap to propose, no scraping required; strategist is final source of truth.
- **D-08** — RLS shape? **→ Admin-only `FOR ALL` policy, mirroring `viral_videos` (273).** Rationale: portal not exposed v1.
- **D-09** — How is the embedding computed? **→ One Gemini Embedding 001 call on the concatenated `[name, industry, services, seed_terms..., tone_descriptors...]` string (max 4k chars trimmed).** Rationale: one vector simplifies cosine compare against `viral_videos.embedding`.

## Data Model

### Migration `274_brand_format_context.sql`

```sql
-- ============================================================
-- VFF-02: Brand-aware ingestion context, one row per client
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS brand_format_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  seed_terms TEXT[] NOT NULL DEFAULT '{}',
  excluded_terms TEXT[] NOT NULL DEFAULT '{}',
  reference_creator_handles JSONB NOT NULL DEFAULT '{"tiktok":[],"instagram":[],"youtube":[]}'::jsonb,
  pillar_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  tone_descriptors TEXT[] NOT NULL DEFAULT '{}',
  seed_embedding VECTOR(1536),
  source TEXT NOT NULL DEFAULT 'auto'
    CHECK (source IN ('auto', 'manual', 'mixed')),
  last_recomputed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_format_context_client
  ON brand_format_context(client_id);

CREATE TRIGGER trg_brand_format_context_updated
  BEFORE UPDATE ON brand_format_context
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE brand_format_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_format_context_admin_all ON brand_format_context
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
```

**Notes:**
- `set_updated_at()` and `vector` extension already confirmed by VFF-01 (T01).
- One row per client enforced via unique index, not a NOT NULL PRIMARY KEY constraint, to allow soft-deletes if needed later.

## API Contracts

### `GET /api/admin/clients/[id]/format-context`
Auth: admin (super_admin or admin role required).
Request: none (path param only).
Response (200):
```ts
{
  context: {
    id: string;
    client_id: string;
    seed_terms: string[];
    excluded_terms: string[];
    reference_creator_handles: {
      tiktok: string[];
      instagram: string[];
      youtube: string[];
    };
    pillar_weights: Record<string, number>;
    tone_descriptors: string[];
    source: 'auto' | 'manual' | 'mixed';
    last_recomputed_at: string | null;
    updated_at: string;
  } | null;
}
```
Errors: 401 unauthorized, 403 forbidden (non-admin), 404 client not found.

### `PATCH /api/admin/clients/[id]/format-context`
Auth: admin.
Request:
```ts
const RequestSchema = z.object({
  seed_terms: z.array(z.string().min(1).max(60)).max(25).optional(),
  excluded_terms: z.array(z.string().min(1).max(60)).max(25).optional(),
  reference_creator_handles: z.object({
    tiktok: z.array(z.string().min(1).max(60)).max(20),
    instagram: z.array(z.string().min(1).max(60)).max(20),
    youtube: z.array(z.string().min(1).max(60)).max(20),
  }).partial().optional(),
  tone_descriptors: z.array(z.string().min(1).max(60)).max(15).optional(),
  pillar_weights: z.record(z.string(), z.number().min(0).max(1)).optional(),
});
```
Behavior: upsert; sets `source = 'manual'` if any field provided, recomputes embedding inline, updates `last_recomputed_at`.
Response (200): same shape as GET, with the updated row.
Errors: 400 invalid input, 401 unauthorized, 403 forbidden, 404 client not found, 500 embedding failure (returns 200 with `seed_embedding = null` plus `warning` field).

### `POST /api/cron/recompute-format-context`
Auth: `Authorization: Bearer ${CRON_SECRET}`.
Request: empty body.
Response (200):
```ts
{
  processed: number;
  succeeded: number;
  failed: number;
  duration_ms: number;
  errors: Array<{ client_id: string; message: string }>;
}
```
Errors: 401 unauthorized, 500 server.

## LLM Prompts

### Prompt: brand-format-context-extraction
Model: `anthropic/claude-sonnet-4.5` via OpenRouter (`lib/ai/openrouter-rich.ts`).
Temperature: 0.2.
Max tokens: 1200.

System:
```
You build a short-form video format research brief for one brand. The brief feeds a discovery pipeline that scrapes TikTok, Instagram Reels, and YouTube Shorts. Output STRICT JSON matching the schema. Sentence case. No em dashes, no en dashes, use commas or periods. Do not invent facts about the brand; if a field is unknown, return an empty array.
```

User template:
```
Brand name: {client_name}
Industry: {industry}
Services: {services}
Caption notes (style guide): {caption_notes}
Recent topic-plan pillars (most recent first): {pillars_list}

Return JSON:
{
  "seed_terms": [up to 20 short-form video search terms, ranked best to worst],
  "tone_descriptors": [up to 8 adjectives that describe the brand voice],
  "reference_creator_handles": {
    "tiktok": [up to 10 handles WITHOUT @],
    "instagram": [up to 10 handles WITHOUT @],
    "youtube": [up to 10 channel names or @handles]
  },
  "pillar_weights": { "<pillar name>": 0..1 } (use empty object if no pillars)
}
```

Output schema:
```ts
const ExtractionSchema = z.object({
  seed_terms: z.array(z.string().min(1).max(60)).max(20),
  tone_descriptors: z.array(z.string().min(1).max(60)).max(8),
  reference_creator_handles: z.object({
    tiktok: z.array(z.string().min(1).max(60)).max(10),
    instagram: z.array(z.string().min(1).max(60)).max(10),
    youtube: z.array(z.string().min(1).max(60)).max(10),
  }),
  pillar_weights: z.record(z.string(), z.number().min(0).max(1)),
});
```

Banned topics: none (this is brand profile extraction; no content policy concerns).

## UI Components

### `components/clients/format-context-editor.tsx`
Purpose: inline editor on brand profile page; surfaces auto-extracted seeds + lets strategist override.
Server component shell + client island for the form.

Props:
```ts
type Props = {
  clientId: string;
  initialContext: BrandFormatContext | null;
};
```

Layout: `SectionPanel` with title "Format-finder seeds." Sub-blocks vertically stacked:
- Seed terms — tag input, chip per term, max 25, "+" to add.
- Excluded terms — same as above, max 25, label "Terms to exclude."
- Reference creators — three tabs (TikTok / Instagram / YouTube), each a tag input max 20.
- Tone descriptors — tag input max 15.
- Footer: "Last auto-recomputed: <relative time>" + buttons "Save changes" (primary) and "Reset to auto" (ghost).

Copy:
- Section title: "Format-finder seeds"
- Section help (?): "These seeds feed the Viral Formats discovery pipeline. We auto-extract them from brand profile + topic plans; override anything that does not feel right."
- Empty seeds placeholder: "No seeds yet. We will fill these on the next nightly pass."
- Save toast: "Seeds updated. Next scrape will pick them up."
- Reset toast: "Reset queued. Next recompute will overwrite."
- Button labels: "Save changes", "Reset to auto", "Add term", "Add creator"

States: loading skeleton (3 rows of pill placeholders), empty (placeholder copy above), saving (button shows spinner inline), error (red helper text under input).

Tokens: `bg-surface`, `accent-text` on save button, `text-muted` for relative time, tag chips reuse existing tag pattern from competitor handle entry.

### `components/clients/brand-profile-editor.tsx` (modify)
Mount `FormatContextEditor` below the existing sections, gated by an Intelligence-section divider.

## File Map

Create:
- `supabase/migrations/274_brand_format_context.sql`
- `lib/analytics/brand-format-context.ts` (helpers + extraction prompt)
- `lib/analytics/brand-format-context.test.ts` (unit tests for extraction parsing + cap enforcement)
- `app/api/admin/clients/[id]/format-context/route.ts` (GET + PATCH)
- `app/api/cron/recompute-format-context/route.ts` (POST cron)
- `components/clients/format-context-editor.tsx`
- `scripts/smoke-format-relevance.ts` (CLI: `npx tsx scripts/smoke-format-relevance.ts <client_id> <video_id>`)
- `tasks/ralph/vff-02-brand-awareness/progress.txt`

Modify:
- `lib/supabase/types.ts` (regenerated; includes `brand_format_context` row type)
- `lib/analytics/types.ts` (export `BrandFormatContext` interface)
- `components/clients/brand-profile-editor.tsx` (mount editor)
- `vercel.json` (register cron `recompute-format-context` daily 04:30 UTC)
- `.env.example` (no new vars; document existing `GOOGLE_AI_STUDIO_API_KEY` usage)

## Env Vars

None new. Consumes existing `OPENROUTER_API_KEY`, `GOOGLE_AI_STUDIO_API_KEY`, `CRON_SECRET`.

## Edge Cases

- **Client with no caption_notes and no topic plans.** Extraction prompt runs on `name + industry + services` only; seeds may be sparser; mark `source='auto'`, do not error.
- **Client paused or inactive.** Cron skips `is_paused = true OR is_active = false` rows.
- **Embedding API rate limit.** Per-call retry x2 with 500ms backoff; on persistent failure, write row with `seed_embedding = null` and log to `api_error_log` (existing table), tagged `vff_brand_context`.
- **LLM returns malformed JSON.** Parse with `safeParse`; on failure log and skip; do not corrupt existing row.
- **Strategist removes all seeds manually.** Allowed; embedding becomes a hash of brand name only; downstream code must handle empty `seed_terms`.
- **`reference_creator_handles` shape drift.** API always normalizes missing platform keys to `[]` before persisting.
- **More than 25 seeds via API.** Zod rejects with 400; UI prevents addition past 25 via disabled "+".
- **Concurrent edits.** Last-write-wins (no optimistic locking); document in editor help text as "Heads up: simultaneous edits overwrite each other."

## Test Plan

Unit:
- `lib/analytics/brand-format-context.test.ts`:
  - Parses well-formed LLM response.
  - Caps `seed_terms` at 20 in extraction (per prompt) and 25 in upsert (per API schema).
  - Normalizes missing platform keys in `reference_creator_handles`.
  - Empty inputs produce empty arrays, not nulls.

Integration:
- Apply migration on Supabase branch, confirm `list_tables` shows `brand_format_context`.
- POST to cron route locally with `CRON_SECRET`; assert rows for all active clients exist.
- PATCH then GET; payload matches.

E2E (Playwright): none in this PRD (Playwright on /admin/clients page deferred).

Manual QA:
- Open `/admin/clients/<id>/brand-profile`, see "Format-finder seeds" section render with auto-extracted seeds.
- Add a seed, save, refresh, persists.
- Click "Reset to auto", trigger cron, seeds replaced with auto extraction.
- Run `npx tsx scripts/smoke-format-relevance.ts <client_id> <video_id>`, cosine >= 0.6 on a hand-tagged on-brand video.

## Architecture Wiring

- Cron registered in `vercel.json` `crons` array alongside `sync-reporting` and `benchmark-snapshots`.
- LLM call follows the same pattern as `lib/audit/analyze.ts`: OpenRouter via `openrouter-rich.ts`, JSON-mode response, Zod parse.
- Embedding generation via `lib/ai/embeddings.ts` (Gemini Embedding 001) keeping vector dimension at 1536.
- API route uses `createAdminClient()` (admin-only) per `.claude/rules/api-routes.md`; Zod validation before auth check before logic.
- Editor mounts inside existing brand profile editor following `IconCard`/`SectionPanel` system per `project_section_card_design_system`.

## Done When

- Migration 274 applied on staging branch, `list_tables` confirms `brand_format_context`.
- Cron `recompute-format-context` runs successfully against staging, writes a row per active client.
- `getBrandFormatSeeds(<active client>)` returns >=5 seeds and >=3 reference creators for >=90% of active clients (verify via `scripts/smoke-format-relevance.ts --audit`).
- Override UI Jack-approved against confirm-platforms baseline.
- `npx tsc --noEmit` clean, `npm run lint` clean.
- progress.txt fully `[x]`.
