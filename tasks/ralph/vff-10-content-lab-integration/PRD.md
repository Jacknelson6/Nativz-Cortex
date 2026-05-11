# PRD: VFF · 10 · Content Lab + Topic Plan integration

> Viral Format Finder · 10/10 · 2026-05-10

## Purpose & Value

Close the loop. A format is only useful if it becomes a script. This phase wires the Format Finder into Content Lab and into `create_topic_plan` so a strategist can go from "I like this comparison hook" to a branded PDF deliverable in one continuous flow. After this PRD, the format library stops being a viewing surface and becomes a content-production input.

## Problem

VFF-02 through VFF-09 build a library of formats with rich analysis. Without VFF-10 they live on an island. The whole point of the series is to shorten the path: format inspiration to video idea to script to branded PDF. Disconnected surfaces mean a copy-paste hand-off step that strategists will skip, which means the analysis sits unread.

## Primary User

Strategist generating client deliverables. Secondary: any agent (Nerd) referencing formats mid-conversation. Tertiary: portal viewer reading deliverables.

## SMART Goals

- "Use this format" handoff lands the strategist in Content Lab with the format pinned in <=2s (perceived).
- `create_topic_plan` accepts a `format_slug` parameter; >=95% of plans generated with one render a format badge in the PDF.
- Within 30 days of launch, >=30% of new topic plans reference a format from the library (telemetry-tracked via `topic_plans.plan_json.format_slug`).
- Portal viewers see formats their strategist pinned (read-only) without RLS leaks; verified via org-scoped query.

## User Stories

- **US-01** — As a strategist, clicking "Use this format" from VFF-09 opens Content Lab with the format card pinned in the right rail and the scripting context augmented with the format's analysis.
- **US-02** — As a strategist, I can use `/generate` and pass `format=<slug>` to seed the topic plan with structural beats from a saved format.
- **US-03** — As Nerd, when a user asks "give me a script in <X> format," I can resolve <X> against the format taxonomy and pull a worked example from the library.
- **US-04** — As a portal viewer, I can see "Inspired by" format references on deliverables my agency sent me, with a small pill that explains the format.

## In Scope

- DB: add `nerd_conversations.format_video_id UUID NULL REFERENCES viral_videos(id) ON DELETE SET NULL` (migration 289). Backfills from VFF-09's `use-in-content-lab` route stub (migrate any `metadata.format_video_id` into the new column on insert).
- Content Lab right rail: format pin slot with link back to detail view.
- Scripting context augmentation: format's `engagement_hook_descriptor`, `why_it_works`, `retention_pattern`, and 4 format-dimension display_names appended to `lib/nerd/content-lab-scripting-context.ts` (note: source PRD says `strategy-lab-scripting-context.ts`; actual file is `content-lab-scripting-context.ts`). Respect existing 10k-char budget; truncate format payload to <=800 chars.
- `create_topic_plan` tool extension at `lib/nerd/tools/topic-plans.ts`:
  - New optional input `format_slug: string | null`.
  - Validation: must exist in `viral_formats` table.
  - When passed, the tool fetches a representative video for that slug (highest views_count + analyzed status) and prepends a "Format reference" block to each generated topic plan section in `plan_json`.
- New Nerd tool `resolve_format` at `lib/nerd/tools/formats.ts`:
  - Input: `{ name_or_slug: string }`.
  - Output: full format detail (kind, slug, display_name, definition, worked_example_video).
  - Registered in `lib/nerd/tools/index.ts` and `lib/nerd/registry.ts`.
- PDF adapter extension: `lib/pdf/branded/adapters.ts` `mapTopicPlanToBranded` renders a "Format" badge per topic card when `plan_json.format_slug` is set.
- Portal route: `app/portal/research/formats/page.tsx` shows pinned-for-this-org formats, read-only.
- Portal API: `app/api/portal/formats/route.ts` (GET only), scoped by `organization_id` via `getPortalClient()`.

## Out of Scope

- Auto-generating a full script from a format alone (still requires user prompting).
- Format A/B comparison tool (later).
- Format performance feedback loop ("which formats led to top-performing client videos") deferred to v2.
- Allowing portal viewers to save/pin (read-only).
- Editing format taxonomy from Content Lab (admin owns via VFF-06).

## Resolved Decisions

- **D-01** — Portal viewers see the FULL format library or pinned-for-their-brand only? **→ Pinned-only.** Rationale: formats are an agency-curated value-add, not a self-serve trending feed; reinforces the agency's role.
- **D-02** — Format reference in the PDF: full breakdown or just a slug badge? **→ Slug badge + 1-line `engagement_hook_descriptor`.** Rationale: deeper info is admin-only; PDF stays scannable.
- **D-03** — When the LLM picks a format the strategist did not select, do we surface that visibly? **→ Yes, name the format on the PDF + scripting context so the strategist can swap if they prefer another.** Rationale: transparency; matches Jack's "no silent decisions" preference.
- **D-04** — How does format pin propagate from VFF-09 to Content Lab? **→ `nerd_conversations.format_video_id` column (migration 289). VFF-09 stub fallback into `metadata.format_video_id` jsonb continues to work; on first read this PRD's helper migrates jsonb stub into the column.** Rationale: typed column beats jsonb for joins.
- **D-05** — Scripting context payload format? **→ Plaintext block titled "Reference format:" + 4 lines (descriptor, why_it_works, retention_pattern, dimensions joined by " | "). Hard-capped at 800 chars.** Rationale: predictable token cost; never breaks 10k budget.
- **D-06** — `create_topic_plan` injection style? **→ Append to system prompt + add `plan_json.format_slug` field + per-section `format_reference` string when relevant.** Rationale: structured for PDF adapter without intruding on existing schema consumers.
- **D-07** — `resolve_format` accepts free-text? **→ Yes; fuzzy match against `viral_formats.slug`, `display_name`, and `aliases[]` (VFF-06 added aliases). Returns top match by similarity OR null with suggestions.** Rationale: agents pass natural language.
- **D-08** — Portal read-only enforcement? **→ Both UI hides write controls AND API rejects non-admin writes AND `getPortalClient()` scopes to organization_id. Three layers per portal security rule.** Rationale: CLAUDE.md hard rule.
- **D-09** — Telemetry on format-referenced plans? **→ Log `format_slug` in `plan_json` and rely on simple SQL count over `topic_plans` for the 30% goal; no separate event table.** Rationale: cheapest signal.

## Data Model

### Migration `289_nerd_conversations_format_video.sql`

Note: migration number assumes 288 (VFF-09) is taken. Renumber forward if collision.

```sql
-- ============================================================
-- VFF-10: Wire format pin into nerd_conversations
-- ============================================================

ALTER TABLE nerd_conversations
  ADD COLUMN IF NOT EXISTS format_video_id UUID
    REFERENCES viral_videos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nerd_conversations_format_video
  ON nerd_conversations(format_video_id)
  WHERE format_video_id IS NOT NULL;

-- One-shot migrate any stubbed jsonb format_video_id into the column.
UPDATE nerd_conversations
SET format_video_id = (metadata->>'format_video_id')::uuid
WHERE format_video_id IS NULL
  AND metadata ? 'format_video_id'
  AND metadata->>'format_video_id' ~* '^[0-9a-f]{8}-';
```

No new tables. `topic_plans.plan_json` already jsonb so the `format_slug` + per-section `format_reference` fields slot in.

## API Contracts

### `POST /api/admin/formats/[id]/use-in-content-lab` (modified from VFF-09)
Auth: admin.
Request: `{ client_id: string (uuid) }`.
Behavior: creates `nerd_conversations` row with `format_video_id = videoId` AND `client_id` set; returns `conversation_id + redirect_url`.
Response: `{ conversation_id: string; redirect_url: string }`.
Note: VFF-09 already created the route. VFF-10 strips the metadata jsonb stub and writes to the typed column.

### `GET /api/portal/formats`
Auth: viewer (portal).
Scoping: `getPortalClient()` returns `{ client_id, organization_id }`. Query pulls `viral_collections` where `client_id IN (clients of this organization) AND name = 'Pinned'`, then `viral_collection_videos`.
Response:
```ts
{
  formats: Array<{
    video_id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    thumbnail_url: string | null;
    source_url: string;
    engagement_hook_descriptor: string | null;
    hook_type_label: string | null;
    archetype_label: string | null;
  }>;
}
```
Errors: 401 (no portal access), 403 (admin trying viewer route), 500.

### Tool: `create_topic_plan` (modified)
Input schema additions (`lib/nerd/tools/topic-plans.ts`):
```ts
format_slug: z.string().optional().nullable()
```
Behavior:
- If `format_slug` provided, validate it exists in `viral_formats`; if not, return tool error with `valid_slugs` suggestion array.
- Fetch a representative `viral_videos` row matching that format (top views_count, status='analyzed').
- Prepend "Reference format:" block to the OpenRouter system prompt (per D-05 format).
- Write `plan_json.format_slug = slug` and `plan_json.format_reference = { display_name, descriptor }`.
- Each topic in `plan_json.topics[]` gets optional `format_reference: { slug, descriptor }` field when the LLM uses it.

### Tool: `resolve_format` (new)
Path: `lib/nerd/tools/formats.ts`.
Input schema:
```ts
const ResolveFormatSchema = z.object({
  name_or_slug: z.string().min(1).max(80),
});
```
Behavior:
- Lowercase input; query `viral_formats` with `ILIKE` on slug, display_name, and `aliases @> ARRAY[input]`.
- If no match, run pg_trgm similarity (`similarity(slug, input) > 0.4`) and return top 3 suggestions.
Output:
```ts
{
  match: {
    kind: 'hook_type' | 'structure' | 'archetype' | 'pacing';
    slug: string;
    display_name: string;
    definition: string | null;
    worked_example: {
      video_id: string;
      platform: string;
      source_url: string;
      engagement_hook_descriptor: string | null;
    } | null;
  } | null;
  suggestions: string[]; // populated only when match is null
}
```

## LLM Prompts

### Scripting context augmentation (deterministic, no LLM call)

Appended to existing scripting-context string when `nerd_conversations.format_video_id` is set:

```
Reference format: {display_name} ({hook_type_label}).
{engagement_hook_descriptor}
Why it works: {why_it_works}
Retention pattern: {retention_pattern}
Dimensions: {hook_type_label} | {structure_label} | {archetype_label} | {pacing_label}
```

Hard-cap at 800 chars; truncate `why_it_works` first if over budget.

### `create_topic_plan` system prompt addition

Prepended to existing prompt when `format_slug` resolved:

```
The strategist has chosen the "{display_name}" format ({hook_type_label} hook, {archetype_label} archetype, {pacing_label} pacing).
A worked example: {engagement_hook_descriptor}
Why this format performs: {why_it_works}
When generating each topic, briefly note how it applies this format. Set plan_json.format_slug = "{slug}".
```

Banned topics: do not fabricate format names. If `format_slug` is null, never invent a format reference.

## UI Components

### `components/content-lab/content-lab-format-pin.tsx` (new)
Props:
```ts
type Props = {
  videoId: string;
  onRemove?: () => void;
};
```
Renders a compact format card in the right rail: thumbnail (9:16 thumbnail at w-32) + display_name + descriptor + "Open detail" link to `/admin/formats/<id>`. Server component; fetches via `getFormatDetail` from VFF-09. "Remove pin" button calls `DELETE /api/admin/nerd-conversations/<id>/format-pin` (new endpoint, see below).

### Modify `components/content-lab/content-lab-workspace.tsx`
Insert `<ContentLabFormatPin videoId={conversation.format_video_id} />` into the right rail when `format_video_id` is set. Pin slot lives above the existing brand-knowledge / research panels.

### `app/portal/research/formats/page.tsx` (new)
Server component:
- Calls `getPortalClient()` to resolve `client_id + organization_id`.
- Calls portal API helper (or direct query) to fetch pinned formats.
- Renders read-only grid of `<FormatCardPortal>` (a thinner variant of `FormatCard`).
- Empty state: "No formats pinned yet. Your strategist will pin reference formats here."

### `components/formats/format-card-portal.tsx` (new)
Read-only variant of `FormatCard`:
- No hover-pin / hover-dismiss controls.
- No "Use this format" CTA.
- Click opens a portal-scoped detail modal at `/portal/research/formats/<id>` (read-only).

### `components/content-lab/content-lab-pin-control.tsx` (new, optional)
Small "Remove pin" pill in the workspace header. Wraps DELETE endpoint.

### Modify `lib/pdf/branded/adapters.ts`
`mapTopicPlanToBranded(plan)`:
- When `plan.plan_json.format_slug` is non-null, render a "Format" badge (small pill, accent color) at the top of each topic card with `display_name`.
- Per-topic `format_reference` (if present) shows a one-line italic note under the topic title: "{descriptor}".

### Modify `lib/nerd/content-lab-scripting-context.ts`
Add `appendFormatContext(opts: { format_video_id: string | null }): Promise<string>` that returns the 800-char block per D-05.

## File Map

Create:
- `supabase/migrations/289_nerd_conversations_format_video.sql`
- `lib/nerd/tools/formats.ts` (resolve_format tool)
- `app/api/admin/nerd-conversations/[id]/format-pin/route.ts` (DELETE, removes format_video_id)
- `app/api/portal/formats/route.ts` (GET, portal-scoped pinned formats)
- `app/portal/research/formats/page.tsx`
- `app/portal/research/formats/[id]/page.tsx` (read-only detail)
- `components/content-lab/content-lab-format-pin.tsx`
- `components/content-lab/content-lab-pin-control.tsx`
- `components/formats/format-card-portal.tsx`
- `lib/portal/get-pinned-formats.ts` (helper used by both API + page)
- `lib/nerd/tools/formats.test.ts`
- `tasks/ralph/vff-10-content-lab-integration/progress.txt`

Modify:
- `lib/nerd/tools/topic-plans.ts` (add `format_slug` input + system-prompt prepend + plan_json fields)
- `lib/nerd/tools/index.ts` (export resolve_format)
- `lib/nerd/registry.ts` (register resolve_format)
- `lib/nerd/content-lab-scripting-context.ts` (append format block helper)
- `lib/pdf/branded/adapters.ts` (`mapTopicPlanToBranded` format badge + per-topic note)
- `components/content-lab/content-lab-workspace.tsx` (mount FormatPin in right rail)
- `app/api/admin/formats/[id]/use-in-content-lab/route.ts` (move from metadata stub to typed column)
- `lib/supabase/types.ts` (regenerate after migration)

## Env Vars

None new.

## Edge Cases

- **Format pinned then video deleted.** `format_video_id` becomes NULL via ON DELETE SET NULL; UI hides pin gracefully.
- **`create_topic_plan` called with bogus format_slug.** Tool returns error with valid suggestions; LLM retries or proceeds without.
- **Scripting context already at 10k chars before format block.** Truncate `why_it_works` to fit; if still over, drop dimensions line. Never exceed 10k.
- **Portal viewer hits `/portal/research/formats` with no `client_id` in their access row.** Empty state.
- **Portal viewer with multi-client org.** Shows pinned formats from any of their accessible clients; pin source visible as small "Pinned for {brand_name}".
- **`resolve_format` fuzzy match returns a banned slug.** Filter out `kind='banned'` matches.
- **PDF rendered without format_slug.** Adapter no-ops; existing layout unchanged.
- **Use-this-format clicked with no active brand.** API requires `client_id`; UI disables button + tooltip "Pick a brand first."
- **Conversation already has a format_video_id.** Use-this-format overwrites it (idempotent UPSERT-style update); toast: "Replaced pinned format with {display_name}."
- **Concurrent strategists pin different formats on same conversation.** Last write wins; no merge logic (acceptable).

## Test Plan

Unit:
- `lib/nerd/tools/formats.test.ts`:
  - Exact slug match returns single result.
  - Display name match (case-insensitive) returns result.
  - Aliases match returns result.
  - Fuzzy match below 0.4 returns null + 3 suggestions.
  - Banned kind filtered out.
- `lib/portal/get-pinned-formats.test.ts`:
  - Scopes by organization_id; multi-client org returns union.
  - Empty when no Pinned collection exists.
- `lib/pdf/branded/adapters.test.ts`:
  - `mapTopicPlanToBranded` with `format_slug` writes badge + per-topic note.
  - Adapter no-ops when format_slug is null.

Integration:
- Apply migration 289; column exists with FK + index.
- POST /api/admin/formats/<id>/use-in-content-lab; conversation row has `format_video_id` set.
- GET /api/portal/formats as viewer; 200 + correct payload; as admin trying viewer path; 403.
- `create_topic_plan` tool call with `format_slug='comparison_hook'`; resulting `plan_json.format_slug === 'comparison_hook'`.

E2E (Playwright):
- From `/admin/formats/<id>` modal, click Use this format; lands at `/admin/content-lab/conversations/<id>` with pinned card visible.
- `/generate` slash command with `format=<slug>`; PDF preview shows Format badge.
- `/portal/research/formats` as a viewer; sees pinned cards; "Use this format" button absent.

Manual QA:
- Verify scripting context never exceeds 10k chars (`scripts/smoke-content-lab-addendum.ts` style; reuse if present).
- Verify PDF format badge typography matches existing topic-plan PDF style.
- Verify "Format" pin tile in right rail aligns with existing pin styles.
- Verify portal nav exposes the new route (sidebar entry under Research).

## Architecture Wiring

- Topic-plan tool path is `lib/nerd/tools/topic-plans.ts` (NOT `lib/ai/tools/create-topic-plan.ts` as source PRD listed; verified via tree).
- Scripting context file is `lib/nerd/content-lab-scripting-context.ts` (NOT `strategy-lab-scripting-context.ts`; verified).
- Right rail mount point: `content-lab-workspace.tsx` already composes the rail; insert `<ContentLabFormatPin />` at the top of the rail stack.
- Portal route lives under `/portal/research/formats` (matching the existing `/portal/research/*` pattern).
- `getPortalClient()` already established in `lib/portal/get-portal-client.ts`; reuse, do not duplicate.
- PDF adapter pattern verified by inspecting `lib/pdf/branded/adapters.ts` exports `mapTopicPlanToBranded`.
- New Nerd tool registration follows existing pattern: tool object exported from tools/formats.ts; re-exported in tools/index.ts; included in `registry.ts` tool array.

## Done When

- Migration 289 applied; column + FK + index present.
- `use-in-content-lab` writes to the typed column (jsonb stub removed).
- `create_topic_plan` accepts `format_slug` and produces PDF with badge.
- `resolve_format` registered + reachable via Nerd; returns shape per contract.
- Content Lab workspace shows the pinned format card in the right rail when set.
- `/portal/research/formats` renders pinned-only formats scoped by organization, read-only, no edit affordances.
- Telemetry: SQL `SELECT count(*) FILTER (WHERE plan_json ? 'format_slug') / count(*) FROM topic_plans WHERE created_at > now() - interval '30 days'` runnable (target >=30% in 30 days; verify the query works on Day 0).
- `npx tsc --noEmit` clean, `npm run lint` clean.
- progress.txt fully `[x]`.
