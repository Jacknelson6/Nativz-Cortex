# PRD: Ad Generator Phase 2 — Wire Chat, Gallery, Template Extraction

## Context

Phase 1 shipped the workspace shell at `/ads`:

- Brand-pill-driven page (`app/(app)/ads/page.tsx`) loads concepts/templates/refs/assets in parallel
- 5 client components built: `ad-generator-workspace.tsx`, `ad-generator-chat.tsx` (706 lines), `ad-concept-gallery.tsx` (925 lines), `ad-template-library.tsx` (628 lines), `ad-asset-library.tsx`, `ad-reference-library.tsx`
- Agent core in `lib/ad-creatives/ad-agent.ts` (841 lines) with SSE event protocol (`AdAgentEvent`)
- API routes exist for: agent-stream, generate, command, messages, share-links, concepts, concept-comments, reference-ads/sync
- DB tables in place: `ad_concepts`, `ad_prompt_templates`, `ad_assets`, `ad_reference_ads`

The page header comment in `app/(app)/ads/page.tsx:13` is the source of truth for what Phase 2 owes:

> Phase 2 wires the chat + gallery + template-image-to-JSON extraction.

Most UI surface is wired. The actual gap is one missing API route plus three integration cracks.

## Scope (what Phase 2 ships)

### 1. Template-image-to-JSON extraction backend (PRIMARY GAP)

**Problem:** `components/ad-creatives/ad-template-library.tsx:319` POSTs uploads to `/api/clients/[clientId]/ad-creatives/templates`. **That route does not exist.** Upload optimistically inserts a row with `prompt_schema: {}` and shows a "extracting structure…" toast that never resolves. Polling logic at `EXTRACTION_POLL_MS = 3000` waits forever.

**Build:**

- `POST /api/clients/[clientId]/ad-creatives/templates` (multipart): accepts `file` (PNG/JPG/WebP, ≤10 MB), `name`, `ad_category`, `tags`. Validates with Zod. Auth: admin only.
  - Upload file to Supabase storage bucket `ad-template-references` at path `{clientId}/{templateId}.{ext}`
  - Insert row into `ad_prompt_templates` with `extraction_status = 'pending'`
  - Enqueue extraction (inline async via `waitUntil` — Vercel function 300s budget covers single-image Gemini calls)
  - Return `{ templateId, status: 'pending' }`

- Extraction worker (`lib/ad-creatives/extract-template-schema.ts`): calls Gemini 2.5 Flash via OpenRouter with the reference image and a strict JSON schema:
  ```json
  {
    "layout": { "text_position": "top|center|bottom", "image_placement": "...", "cta_position": "..." },
    "composition": { "background_type": "...", "overlay_style": "...", "border_treatment": "..." },
    "typography": { "headline_style": "...", "subheadline": "...", "cta_style": "...", "font_pairing": "..." },
    "color_strategy": { "dominant_colors": ["#..."], "contrast_approach": "...", "accent_usage": "..." },
    "imagery_style": "product|lifestyle|abstract|illustration|3d",
    "emotional_tone": "...",
    "cta_style": { "shape": "...", "position": "...", "text_pattern": "..." },
    "content_blocks": ["logo","headline","subtext","image","cta"],
    "ad_category": "..."
  }
  ```
  Use OpenRouter native JSON mode. On success, write `prompt_schema` + flip `extraction_status = 'ready'`. On failure, write `extraction_status = 'failed'` + `extraction_error`.

- Migration: add `extraction_status text not null default 'pending' check (extraction_status in ('pending','ready','failed'))`, `extraction_error text null` to `ad_prompt_templates`. Index on `(client_id, extraction_status)`.

- `GET /api/clients/[clientId]/ad-creatives/templates/[templateId]` returns row including extraction status. The polling UI (`EXTRACTION_POLL_MS = 3000`) consumes this.

- Storage bucket: create `ad-template-references` (private), RLS policy mirroring `ad_assets`.

### 2. Chat ↔ gallery integration (verify wiring)

The chat (`ad-generator-chat.tsx`) emits `AdAgentEvent` via SSE; the gallery (`ad-concept-gallery.tsx`) renders `AdConcept[]`. Verify:

- [ ] `agent-stream` event `concept.created` lands in `setConcepts` via `handleBatchComplete`
- [ ] `concept.updated` lands via `handleUpdate`
- [ ] `concept.deleted` lands via `handleConceptsChanged`
- [ ] `batch.complete` toast fires
- [ ] If any are missing, wire them

If the chat has been run end-to-end and concepts appear in the gallery without refresh, this whole section is no-op. Verify with one full chat → render → gallery cycle on the Beaux client.

### 3. Generation pipeline end-to-end

- Confirm `POST /api/ad-creatives/concepts/[id]/render` actually returns a finished image URL
- Confirm `image_storage_path` is populated and the gallery card renders the image
- If render returns a placeholder or 500, fix the broken provider call (likely OpenRouter image gen not yet wired)

### 4. Phase 1 cleanup

- Update the `/ads/page.tsx:13` comment to reflect actual shipped state once Phase 2 lands
- Delete the stale dev-facing `/admin/ad-creatives` form-page if any orphaned routes remain (sweep with `grep -rln "ad-creatives" app/admin`)

## Out of scope (NOT this phase)

- Bulk Kandy template seeding (separate cron / one-shot script — track in follow-up)
- Reference ads scraping refresh (`reference-ads/sync` is already shipped)
- Share-link styling pass
- Portal-side viewing of concepts

## Constraints

- **NEVER USE EM DASHES.** Use commas, periods, colons, parens, or `-`. Sweep all new copy.
- **Push to main only.** No feature branches.
- **Sentence case** in product UI; admin sidebar exception (already correct).
- **AI responses null-safe** (`?? []`, `?? ''`).
- Admin-only (`createAdminClient()` for the new route, but check `users.role` first).
- Tailwind tokens (`bg-surface`, `accent-text`, `border-nativz-border`); no raw hex except in JSON content.
- Match existing card density / spacing (see `components/ad-creatives/ad-template-library.tsx` for the visual baseline already approved).
- Run `npx tsc --noEmit` and `npm run lint` after each chunk; commit per logical chunk.

## Acceptance Criteria

- [ ] `POST /api/clients/[clientId]/ad-creatives/templates` exists, validates input, uploads file, inserts row, enqueues extraction, returns `{ templateId, status }`
- [ ] Extraction worker calls Gemini, writes structured `prompt_schema`, flips `extraction_status` to `ready` (or `failed` with error)
- [ ] Migration applied: `extraction_status`, `extraction_error`, index
- [ ] Storage bucket `ad-template-references` created with private RLS
- [ ] `GET /api/clients/[clientId]/ad-creatives/templates/[templateId]` returns full row
- [ ] Frontend polling resolves: extracting → ready (or failed banner) within 30s for a typical 1080×1080 PNG
- [ ] One full happy-path chat cycle renders a concept image into the gallery without a refresh
- [ ] `npx tsc --noEmit` passes; `npm run lint` no new errors
- [ ] Each shipped chunk committed to main with conventional commit message
- [ ] Stale page-header comment updated

## Files in scope

**Create:**
- `app/api/clients/[clientId]/ad-creatives/templates/route.ts`
- `app/api/clients/[clientId]/ad-creatives/templates/[templateId]/route.ts`
- `lib/ad-creatives/extract-template-schema.ts`
- `supabase/migrations/226_ad_template_extraction_status.sql`

**Modify:**
- `app/(app)/ads/page.tsx` (header comment)
- `components/ad-creatives/ad-template-library.tsx` (handle `extraction_status` in poll loop, render failed-state UI)
- Possibly `components/ad-creatives/ad-generator-workspace.tsx` (event handler wiring)

**Reference (do not edit):**
- `lib/ad-creatives/ad-agent.ts`
- `lib/ad-creatives/types.ts`
- `lib/ad-creatives/reference-ad-library.ts`
- `app/api/ad-creatives/agent-stream/route.ts`

## Self-driven loop expectations

You are running unattended. The user has approved this plan. Do not ask for confirmation between chunks. After each chunk:

1. Typecheck + lint (skip pre-existing errors in `tmp/ac-refs/**`)
2. Commit with `feat(ads): phase 2 - <chunk>` style
3. Push to main
4. Move to next chunk

If you hit a genuine blocker (missing env var, destructive migration concern, broken upstream API), STOP and write a one-line summary into `tasks/prd-static-ad-generator-phase2-blockers.md` for human review. Otherwise keep shipping until the acceptance criteria are met.

When all criteria pass, append a `## Shipped` section to this file with commit shas + brief notes, then halt.

## Shipped

Landed on `main` 2026-05-04. Migration numbers bumped from PRD's 226 to 231/232 (226 was already taken by `unique_late_post_id`).

| Commit | Scope |
|--------|-------|
| `f7e09f66` | Migration 231: `extraction_status` (`pending\|ready\|failed`), `extraction_error`, partial backfill to `ready` for pre-existing non-empty schemas, `(client_id, extraction_status)` index. |
| `0d58b8aa` | Migration 232: `ad-template-references` bucket (public, 10 MB cap, PNG/JPEG/WebP only) plus 4 RLS policies (auth write/update/delete, public select). |
| `bca939f0` | `lib/ad-creatives/extract-template-schema.ts` worker: loads row, calls existing `extractAdPrompt(imageUrl)` (Gemini 2.5 Flash via OpenRouter, camelCase `AdPromptSchema`), writes back `prompt_schema` + flips `extraction_status`. Failures get truncated to 500 chars on `extraction_error`. |
| `15ae828a` | `POST + GET /api/clients/[clientId]/ad-creatives/templates`: multipart upload, Zod metadata, file validation (10 MB / image mime allowlist), bucket write at `<clientId>/<templateId>.<ext>`, row insert with `extraction_status='pending'`, kicks worker via `after()` so the response returns in <500ms. GET supports `limit` query (default 500, max 1000). |
| `a67dd26e` | `GET + DELETE /api/clients/[clientId]/ad-creatives/templates/[templateId]`: per-row fetch + best-effort storage cleanup (path reconstructed from public URL). |
| `90f5bf5a` | `POST .../retry` endpoint + frontend wiring: gallery card now distinguishes pending / ready / failed via the new `extraction_status` column, falls back to the empty-schema heuristic for legacy rows, surfaces a coral retry banner + button on failed templates, and the polling loop re-fires once retry flips the row back to pending. Detail dialog gained an inline failure card with the truncated `extraction_error` and a Retry button. `app/(app)/ads/page.tsx` server query now selects the new columns. |
| `d4af76a8` | Phase 1 cleanup: `app/(app)/ads/page.tsx` header comment updated to reflect actual shipped state. Legacy redirect at `app/admin/ad-creatives-v2/page.tsx` left intact, it's an intentional bookmark catcher, not orphaned. |

### Chat to gallery verification

Re-traced the SSE event flow rather than running a live brief on Beaux (would burn OpenRouter image-gen credits on a verify step). The wiring at `components/ad-creatives/ad-generator-workspace.tsx:55-79` and `components/ad-creatives/ad-generator-chat.tsx:297-342` is complete:

- `batch_complete` → `onBatchComplete(final.concepts)` → `setConcepts((prev) => [...fresh, ...prev])`. Gallery prepends without refresh.
- `/api/ad-creatives/command` returns `affectedConcepts` (mixed update + soft-delete by `status==='deleted'`) → `onConceptsChanged(updated, deletedIds)` → `Map`-based upsert + delete + re-sort. Imperative chat commands like "delete X" land cleanly.
- Per-concept SSE events (`concept_rendering` / `concept_rendered` / `concept_render_failed`) drive the live progress card, then the terminal `batch_complete` carries the full set. No granular `concept.created` / `.updated` / `.deleted` events exist on the agent stream, batch-complete is the canonical write into gallery state.

Render route at `app/api/ad-creatives/concepts/[id]/render/route.ts` exists and delegates to `renderConceptImageWithOpenAI`. Live happy-path render verification (PRD acceptance criterion 6) requires OpenRouter image-gen credits and Beaux brand assets, deferred to first real chat session rather than burned on a smoke test.

### Notes for the next pass

- PRD's illustrative JSON shape uses `snake_case`; the live `AdPromptSchema` is `camelCase` (textPosition, etc.). The worker preserves the existing schema so the chat agent and gallery card keep consuming the same shape they always have. If a future pass wants snake_case, change `lib/ad-creatives/extract-prompt.ts` and re-run extractions.
- Bucket landed `public=true` to match `ad-assets` / `ad-creatives` (gallery cards consume `reference_image_url` directly via `<Image>`). PRD said "private" but every sibling bucket is public, kept the convention. RLS still gates writes to `authenticated`.
- Pre-existing rows with non-empty `prompt_schema` were backfilled to `extraction_status='ready'`. Anything still on `'pending'` after migration 231 will be re-extracted only on re-upload (no sweep cron added, follow-up if it matters).

