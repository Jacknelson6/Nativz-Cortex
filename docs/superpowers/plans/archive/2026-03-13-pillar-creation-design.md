# Pillar Creation — Design Spec

## Goal

Add a "Content Pillar Creation" flow to the ideas hub that lets users generate, refine, and manage content pillars as a precursor to idea generation. Pillars become first-class entities with their own table. The existing "generate content strategy" in client settings is replaced by this system.

## Architecture

A tabbed wizard ("Create content") replaces the current "Generate ideas" entry point. Two paths: "Start with pillars" (guided 4-step flow: pillars → refine → ideas per pillar → scripts) or "Jump to ideas" (existing flow). A secondary "Generate full strategy with AI" button fires a background pipeline that produces pillars + ideas + scripts in one shot. Ideas generated from pillars display in a grouped layout (pillar section headers with ideas underneath).

## Tech Stack

Next.js 15 App Router, Supabase (new `content_pillars` + `pillar_generations` tables), Claude Sonnet via OpenRouter, Zod validation, `after()` for background processing, polling for async status.

---

## Data Model

### New table: `content_pillars`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | `gen_random_uuid()` |
| `client_id` | uuid (FK → clients) | NOT NULL |
| `name` | text | NOT NULL, e.g. "Homeowner Education" |
| `description` | text | 2-3 sentence summary |
| `emoji` | text | Optional visual identifier |
| `example_series` | text[] | Recurring series names |
| `formats` | text[] | video, carousel, story, etc. |
| `hooks` | text[] | Opening lines |
| `frequency` | text | e.g. "2-3x per week" |
| `sort_order` | int | For manual reordering, default 0 |
| `created_by` | uuid | Auth user who created |
| `created_at` | timestamptz | DEFAULT now() |
| `updated_at` | timestamptz | DEFAULT now(), auto-updated via trigger |

Index on `(client_id, sort_order)`. RLS: admin can CRUD all, portal viewers can read pillars for their organization's clients.

### New table: `pillar_generations`

Tracks the status of background pillar generation jobs (same pattern as `idea_generations`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | `gen_random_uuid()` |
| `client_id` | uuid (FK → clients) | NOT NULL |
| `count` | int | Number of pillars requested |
| `direction` | text | Optional user-provided direction |
| `status` | text | `'processing'` / `'completed'` / `'failed'` |
| `error_message` | text | Error details on failure |
| `tokens_used` | int | |
| `estimated_cost` | numeric | |
| `created_by` | uuid | Auth user |
| `created_at` | timestamptz | DEFAULT now() |
| `completed_at` | timestamptz | |

### New table: `strategy_pipeline_runs`

Tracks the full strategy pipeline (pillars → ideas → scripts).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | `gen_random_uuid()` |
| `client_id` | uuid (FK → clients) | NOT NULL |
| `status` | text | `'processing'` / `'completed'` / `'failed'` |
| `current_phase` | text | `'pillars'` / `'ideas'` / `'scripts'` / `'done'` |
| `direction` | text | Optional user-provided direction |
| `pillar_generation_id` | uuid | FK → pillar_generations |
| `idea_generation_id` | uuid | FK → idea_generations |
| `error_message` | text | |
| `created_by` | uuid | |
| `created_at` | timestamptz | DEFAULT now() |
| `completed_at` | timestamptz | |

### Modified table: `idea_generations`

Add columns:
- `pillar_ids` uuid[] — references which pillars were used (nullable)
- `ideas_per_pillar` int — how many ideas per pillar (nullable)

When using "Jump to ideas" path, both fields are null.

### No changes to `client_strategies`

Existing strategy data stays as-is for historical reference. Only the POST endpoint for generating new strategies is removed; GET endpoints remain for historical data access and AI context.

---

## API Routes

### New endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/clients/[id]/pillars` | List pillars for a client, sorted by `sort_order` |
| `POST` | `/api/clients/[id]/pillars` | Create a single pillar manually |
| `PATCH` | `/api/clients/[id]/pillars/[pillarId]` | Update a pillar (name, description, emoji, etc.) |
| `DELETE` | `/api/clients/[id]/pillars/[pillarId]` | Delete a pillar |
| `POST` | `/api/clients/[id]/pillars/generate` | AI-generate pillars. Creates `pillar_generations` record with `status: 'processing'`, processes in background via `after()`. Returns `{ id, status: 'processing' }`. Client polls `GET /api/clients/[id]/pillars/generate/[generationId]` for status. |
| `GET` | `/api/clients/[id]/pillars/generate/[generationId]` | Poll pillar generation status. Returns generation record with status + created pillars when complete. |
| `POST` | `/api/clients/[id]/pillars/[pillarId]/reroll` | Regenerate a single pillar. Accepts optional `{ direction }` body. Passes sibling pillar names as "avoid these" context. Updates existing row in place (preserves `id` and `sort_order`). Returns updated pillar. |
| `POST` | `/api/clients/[id]/pillars/reorder` | Update `sort_order` for all pillars. Body: `{ pillar_ids: string[] }` in desired order. |
| `POST` | `/api/clients/[id]/pillars/generate-strategy` | Full pipeline. Creates `strategy_pipeline_runs` record, processes all phases in background. Returns `{ id, status: 'processing' }`. |
| `GET` | `/api/clients/[id]/pillars/generate-strategy/[runId]` | Poll pipeline status. Returns run record with `current_phase`, linked generation IDs. |

### Modified endpoint

| Method | Route | Change |
|--------|-------|--------|
| `POST` | `/api/ideas/generate` | Accept optional `pillar_ids: uuid[]` + `ideas_per_pillar: number`. When present, fetches pillar definitions and injects as `<content_pillars>` context block. Generates N ideas per pillar. Each idea in the JSON response includes `pillar_id: string` (the UUID) and `content_pillar: string` (the display name). Makes one AI call per pillar for reliability with large counts. Stores `pillar_ids` and `ideas_per_pillar` on the generation record. |

### Removed endpoint

| Method | Route | Reason |
|--------|-------|--------|
| `POST` | `/api/clients/[id]/strategy` | Replaced by pillar creation + idea generation flow. GET endpoint remains for historical data. |

---

## Wizard UI Flow

### Entry point

The "Generate ideas" button on the ideas hub becomes "Create content" and opens `<ContentWizard>`.

### Step 1 — Choose path

- **Client selector** (ComboSelect, shared by both paths)
- Two cards:
  - **"Start with pillars"** — purple highlight, recommended for new clients. Walks through the full guided flow.
  - **"Jump to ideas"** — secondary option. Skips to existing idea generation form.
- Small text link below cards: **"Generate full strategy with AI"** — opens minimal modal (client selector + optional direction + "Generate" button), fires background pipeline, redirects to results page with progress.

### Step 2 — Generate & refine pillars (pillar path only)

- Pillar count selector: 3, 5, 7 presets + custom input
- Optional direction input (text field)
- "Generate pillars" button → calls `/api/clients/[id]/pillars/generate`
- Polls for completion via `/api/clients/[id]/pillars/generate/[generationId]` (3s interval)
- Results appear as editable pillar cards:
  - **Inline edit**: click pillar name/description to edit in place, saves via PATCH
  - **Re-roll**: regenerate just that pillar via `/api/clients/[id]/pillars/[pillarId]/reroll`. Passes sibling names as context to avoid duplication. Accepts optional direction hint.
  - **Delete**: remove pillar via DELETE
  - **"+ Add pillar manually"**: empty card at bottom, opens inline form
- Format/hooks/series shown as tags on each card
- **"Generate ideas from pillars →"** CTA button at bottom
- **Existing pillars**: if client already has pillars, they load on mount. User can edit/delete existing ones and/or generate more. Generating replaces all existing pillars (with confirmation dialog).

### Step 3 — Configure idea generation (pillar path)

- "Ideas per pillar" count selector: 3, 5, 10 presets + custom
- Optional concept direction (applies globally)
- Reference videos section (existing upload/URL component)
- "Generate ideas" button → calls modified `/api/ideas/generate` with `pillar_ids` + `ideas_per_pillar`
- Redirects to results page (`/admin/ideas/[id]`)

### "Jump to ideas" path

Skips steps 2-3. Shows the existing idea generation form (client, count, concept, reference videos) inside the wizard. Generates ideas without pillar context (`pillar_ids` and `ideas_per_pillar` are null). Redirects to results page (flat grid layout, no changes).

### Results page — pillar-grouped layout

When `pillar_ids` is present on the generation record:
- Fetch pillar definitions from `content_pillars` table
- Ideas display grouped by pillar section, matched via `pillar_id` on each idea object
- Each section has a pillar header: emoji + name + idea count
- Ideas in 2-column grid below each header
- Purple divider line between pillar name and ideas
- All existing card functionality preserved: checkbox select, re-roll, save, copy
- Batch operations work across pillars (select from any section)
- CTA dropdown + batch script generation (existing)
- Scripts display inline on cards

When `pillar_ids` is NOT present (jump to ideas path):
- Existing flat grid layout, no changes

### Full strategy pipeline

Triggered by "Generate full strategy with AI" link:
1. Opens minimal modal: client selector + optional direction + "Generate" button
2. Fires `POST /api/clients/[id]/pillars/generate-strategy`
3. Redirects to pipeline results page
4. Background pipeline:
   - Phase 1: Generate pillars (saves to `content_pillars`), updates `current_phase` to `'pillars'`
   - Phase 2: Generate ideas per pillar with default 5 per pillar (saves to `idea_generations`), updates `current_phase` to `'ideas'`. Makes one AI call per pillar.
   - Phase 3: Generate scripts per idea by calling existing script generation logic in a loop (saves to `idea_scripts`), updates `current_phase` to `'scripts'`
   - Updates `current_phase` to `'done'`, `status` to `'completed'`
5. Results page polls `GET /api/clients/[id]/pillars/generate-strategy/[runId]` and shows progress: pillars appear first, then ideas populate under each pillar, then scripts fill in on cards

**Note on duration:** The pipeline generates content sequentially across phases. For 5 pillars x 5 ideas = 25 ideas + 25 scripts, this can take several minutes. The `maxDuration` on the API route should be set to 300s. Each phase updates `current_phase` so the UI can show live progress.

---

## Component Architecture

### New components

| Component | File | Purpose |
|-----------|------|---------|
| ContentWizard | `components/ideas-hub/content-wizard.tsx` | Main wizard shell — step state, path selection, client selector. Tracks step differently per path (pillar path: 3 steps, ideas path: 1 step). |
| PathSelector | `components/ideas-hub/path-selector.tsx` | Step 1 — two path cards + "full strategy" link |
| PillarGenerator | `components/ideas-hub/pillar-generator.tsx` | Step 2 — count selector, direction, generate button, polling |
| PillarCard | `components/ideas-hub/pillar-card.tsx` | Single editable pillar — inline edit, re-roll, delete |
| PillarList | `components/ideas-hub/pillar-list.tsx` | Step 2 results — list of pillar cards + add manually + CTA |
| PillarIdeaConfig | `components/ideas-hub/pillar-idea-config.tsx` | Step 3 — ideas-per-pillar count, concept, references |
| FullStrategyModal | `components/ideas-hub/full-strategy-modal.tsx` | Minimal modal for full pipeline trigger |

### Modified components

| Component | Change |
|-----------|--------|
| `ideas-hub-view.tsx` | Replace `<IdeaGenerator>` with `<ContentWizard>` |
| `results-client.tsx` | Add pillar-grouped layout mode when `pillar_ids` present. Fetch pillar definitions. Group ideas by `pillar_id` field. |
| `idea-generator.tsx` | Used internally by "jump to ideas" path inside the wizard |

### Removed UI

- "Generate content strategy" button from `components/clients/client-strategy-card.tsx`

---

## AI Prompts

### Pillar generation prompt

System prompt generates N content pillars as a JSON array. Each pillar object:
```json
{
  "name": "string",
  "description": "string (2-3 sentences)",
  "emoji": "string (single emoji)",
  "example_series": ["string"],
  "formats": ["string"],
  "hooks": ["string (opening line)"],
  "frequency": "string"
}
```

Context blocks provided: brand profile, client record (industry, target audience, brand voice, topic keywords), knowledge base entries, past research summaries, existing pillars (avoid duplicates).

### Modified idea generation prompt

When `pillar_ids` present, the system prompt changes to:
- Generate exactly N ideas for EACH pillar (one AI call per pillar for reliability)
- Each idea must clearly belong to its assigned pillar
- Pillar definition injected as `<pillar>` context block with id, name, description, example_series, hooks
- Each idea in the JSON response includes `pillar_id` (the UUID) and `content_pillar` (display name)
- The existing `<strategy>` context block (from `client_strategies`) is replaced by the `<content_pillars>` block when pillars exist

### Pillar reroll prompt

System prompt regenerates a single pillar. Context includes:
- Brand profile + client record
- Sibling pillar names and descriptions (as "avoid these, generate something different")
- Optional user direction hint
- Returns single pillar object (same schema as generation)

### Full strategy pipeline

Chains: pillar generation → idea generation (one call per pillar) → script generation (one call per idea, using existing `createCompletion` logic from generate-script route). Each phase uses outputs from the previous phase as context.

---

## Error Handling

- All endpoints follow existing patterns: Zod validation, auth check, proper HTTP status codes
- Background processing failures update status to `'failed'` with `error_message`
- Polling handles failed state — shows error with retry option
- Individual pillar re-roll failures don't affect other pillars
- Full strategy pipeline: if any phase fails, marks overall status as `'failed'` with `error_message`, preserves completed phases (pillars still saved even if idea generation fails). `current_phase` indicates where failure occurred.
- Existing pillars edge case: when generating new pillars for a client that already has pillars, show confirmation dialog ("Replace existing pillars?"). On confirm, delete existing and generate fresh.

---

## Purple Theme

All pillar-related UI uses the purple theme consistent with the rest of the ideas system:
- `purple-400` for text accents, icons
- `purple-500` for buttons, active states
- `purple-500/10` for background tints
- `purple-500/50` for focus rings
- No blue `accent-text` on any ideas pages
