# PRD: SPY · 04 · Checklist scorecard + free-value PDF + share link

> Spying → Prospect Pipeline · 04/10 · 2026-05-10

## Purpose & Value

Turn SPY-03's analysis into a tangible, leave-behind deliverable: a fixed 10-item checklist scored R/Y/G deterministically, rendered as a branded PDF and a public share link the sales rep can drop in an email within 30 seconds. Standard rubric across every prospect makes the conversation comparable and the work scalable.

## Problem

Custom narrative reports take strategist time and read inconsistent. A fixed checklist with deterministic R/Y/G grading is faster, comparable, and gives the prospect a free deliverable that builds trust on or after a sales call. We have the data from SPY-03; we lack the rubric, the PDF adapter, and the share link wrapper.

## Primary User

Sales rep (creates + shares). Prospect (one-way recipient via PDF + share link). Strategist (overrides edge-case scores before PDF generation).

## SMART Goals

- PDF generates from a `succeeded` SPY-03 analysis in ≤ 10s (p95).
- All 10 items score deterministically from `prospect_analyses` fields (no LLM in the grading loop).
- Share link renders read-only public scorecard in ≤ 1s server-side.
- Share link expiry default 90 days; configurable per link.
- 5 different prospects yield 5 visually distinct branded PDFs (same template, different brand pulls).

## User Stories

- **US-01** — As a sales rep, after SPY-03 analysis completes I see a "Generate scorecard" button; clicking it produces a branded PDF stored in Supabase Storage + a public share link, both surfaced inline.
- **US-02** — As a strategist, I can override any single checklist item's score (R/Y/G) and note before generating the PDF; overrides persist for re-generation.
- **US-03** — As a sales rep, I can copy a public link (`/shared/prospect/[token]`) for the scorecard without auth.
- **US-04** — As a sales rep, I can email the PDF link directly from the prospect record (drafts only via Gmail SA per `feedback_no_autonomous_email_send.md`).
- **US-05** — As a prospect visiting the share link, I see the scorecard, the brand cover, and a small "Want a deeper analysis?" CTA at the bottom.
- **US-06** — As an admin, I can archive a share link (sets `archived_at`) to revoke public access.

## In Scope

- Migration `279_prospect_share_links.sql`: `prospect_share_links` + `prospect_share_link_views` (mirror `audit_share_links` + analytics-view pattern).
- Checklist definition: 10 items, deterministic rules in `lib/prospects/checklist.ts`.
- Override surface on prospect detail Analysis tab.
- API: `POST /api/prospects/[id]/scorecard` (generate PDF + share link), `GET /api/prospects/[id]/scorecard` (read latest), `GET /api/shared/prospect/[token]` (public read), `POST /api/shared/prospect/[token]/views` (analytics ping), `POST /api/prospects/[id]/scorecard/archive` (admin archive).
- PDF: extend `lib/pdf/branded/` with `mapProspectScorecardToBranded` adapter and (if needed) a scorecard-specific template variant.
- Public route: `app/shared/prospect/[token]/page.tsx`.
- Brand cover assets: pulled from prospect's website favicon + cached image; fallback to Nativz logo.

## Out of Scope

- LLM in grading loop (rules only).
- Custom rubrics per industry (single global rubric v1).
- Embedded video clips in PDF.
- Auto-email send to prospect (drafts only via SPY-10).
- Comments / signing / approval on share link (SPY-09 / editing-share patterns own that).
- Multi-prospect PDF compendium.

## Resolved Decisions

- **D-01** — Overall score number or just item-by-item? **→ Just item-by-item; a header summary counts the R/Y/G totals ("3 improvements / 4 okay / 3 great") instead of a 7/10 number.** Rationale: a number invites argument; counts invite action.
- **D-02** — Prospect can comment on PDF? **→ No, one-way v1.** Rationale: editing-share pattern is heavy; this is a sales asset, not a collaboration surface.
- **D-03** — Share link expiry? **→ Default 90 days; admin-settable on create.** Rationale: matches existing share-link norms; long enough to outlive a sales cycle.
- **D-04** — Item count? **→ Exactly 10.** Rationale: round, scannable, fits one PDF page summary.
- **D-05** — Override storage? **→ `prospect_analyses.overrides` (already present from SPY-03) extended with `checklist_overrides` key — `{ items: { [item_id]: { score, note } } }`.** Rationale: single source of truth for both SPY-03 fields and SPY-04 grades.
- **D-06** — PDF storage? **→ Supabase Storage bucket `prospect-pdfs` (private by default, signed URLs for share).** Rationale: matches existing PDF pattern for branded deliverables.
- **D-07** — Public route renders PDF inline or scorecard HTML? **→ HTML rendering of the same data; PDF download button.** Rationale: PDFs are clunky to preview; HTML loads instantly; download CTA covers the leave-behind use case.
- **D-08** — Share link token format? **→ 32-char URL-safe base64 (same as `audit_share_links`).** Rationale: copy existing pattern.
- **D-09** — How are checklist items keyed? **→ Stable string IDs (`bio_optimized`, `profile_pic_pro`, `cadence_consistent`, `caption_hooks`, `caption_ctas`, `comment_replies`, `hashtag_strategy`, `content_variety`, `bio_link_drives_click`, `voice_consistent`).** Rationale: rename-safe; stored in DB.
- **D-10** — How does the rubric handle missing inputs? **→ Items requiring missing data score `'na'` (a 4th value alongside R/Y/G); the summary skips them; PDF marks "Not enough data".** Rationale: better than guessing.
- **D-11** — Re-generation invalidates old PDFs? **→ Old PDFs remain accessible via their original token; a regen creates a new token. Old tokens can be archived manually.** Rationale: don't break previously-shared links.

## Data Model

### Migration `279_prospect_share_links.sql`

```sql
-- ============================================================
-- SPY-04: Prospect scorecard share links + view analytics
-- Mirrors audit_share_links pattern.
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES prospect_analyses(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  pdf_storage_path TEXT,                       -- supabase storage path (bucket: prospect-pdfs)
  scorecard_snapshot JSONB NOT NULL,           -- frozen scorecard at generation time
  name TEXT,                                    -- optional, e.g. "First send to Nike, 2026-05-10"
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '90 days'),
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospect_share_links_prospect ON prospect_share_links(prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_share_links_token ON prospect_share_links(token);
CREATE INDEX IF NOT EXISTS idx_prospect_share_links_active
  ON prospect_share_links(prospect_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS prospect_share_link_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES prospect_share_links(id) ON DELETE CASCADE,
  viewer_ip_hash TEXT,                          -- hashed IP for privacy
  viewer_ua TEXT,
  referrer TEXT,
  duration_ms INTEGER,                          -- optional, ping back on unload
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospect_share_link_views_link_time
  ON prospect_share_link_views(share_link_id, viewed_at DESC);

-- RLS
ALTER TABLE prospect_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_share_link_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospect_share_links_admin_all ON prospect_share_links
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

-- Public-read by token via service-role-only public API; no anon SELECT policy.
CREATE POLICY prospect_share_link_views_admin_all ON prospect_share_link_views
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
```

Note: the public share endpoint uses `createAdminClient()` and resolves token → row server-side; no anon SELECT policy is needed.

## API Contracts

### `POST /api/prospects/[id]/scorecard`

Auth: admin.
Route config: `export const maxDuration = 60;`

Request:
```ts
const RequestSchema = z.object({
  analysis_id: z.string().uuid().optional(),    // defaults to latest succeeded analysis
  name: z.string().max(120).optional(),
  expires_in_days: z.number().int().min(1).max(365).default(90),
});
```

Behaviour:
1. Resolve analysis row; 422 if no succeeded analysis.
2. Compute scorecard via `lib/prospects/checklist.ts#computeScorecard(analysis)`.
3. Build PDF via `lib/pdf/branded/` with `mapProspectScorecardToBranded`.
4. Upload PDF to Supabase Storage at `prospect-pdfs/<prospect_id>/<token>.pdf`.
5. INSERT `prospect_share_links` with `token`, `pdf_storage_path`, `scorecard_snapshot`.
6. Write touchpoint kind='note' body=`Scorecard generated, share link minted`.

Response (200):
```ts
{
  share_link: {
    id: string;
    token: string;
    url: string;             // absolute, https://cortex.nativz.io/shared/prospect/<token>
    expires_at: string;
    pdf_signed_url: string;  // 1h expiry signed URL
  };
  scorecard: ScorecardSnapshot;
}
```

Errors: 400 invalid input, 401, 403, 404 prospect, 422 no analysis.

### `GET /api/prospects/[id]/scorecard`

Auth: admin.

Query: `?include_archived=true` (default false).

Response (200):
```ts
{
  share_links: Array<{ id; token; name; expires_at; archived_at; created_at; pdf_signed_url }>;
  scorecard_preview: ScorecardSnapshot | null;     // computed live from latest analysis
}
```

### `POST /api/prospects/[id]/scorecard/archive`

Auth: admin.

Request:
```ts
const RequestSchema = z.object({ share_link_id: z.string().uuid() });
```

Behaviour: sets `archived_at = now()`.

Response (200): `{ ok: true }`.

### `GET /api/shared/prospect/[token]`

Auth: public.

Behaviour:
1. Lookup row by token via `createAdminClient()` (service role).
2. If null or archived or `expires_at < now()` → 404.
3. Return `scorecard_snapshot`, `prospect.brand_name`, `prospect.primary_handle`, `prospect.primary_platform`, `pdf_signed_url` (1h).

Response (200):
```ts
{
  brand_name: string;
  primary_handle: string | null;
  primary_platform: 'tiktok'|'instagram'|'youtube'|'facebook'|null;
  generated_at: string;
  scorecard: ScorecardSnapshot;
  pdf_url: string;        // signed Supabase URL, 1h
}
```

Errors: 404 (covers expired + archived; never surfaces "expired" vs "archived" to public).

### `POST /api/shared/prospect/[token]/views`

Auth: public.

Request:
```ts
const RequestSchema = z.object({
  duration_ms: z.number().int().min(0).max(86400000).optional(),
  referrer: z.string().max(2048).optional(),
});
```

Behaviour: insert `prospect_share_link_views`. Rate-limit by IP hash (1 view per minute per token per IP).

Response (200): `{ ok: true }`.

## LLM Prompts

None. Grading is rule-based.

### Scorecard rubric (deterministic)

`lib/prospects/checklist.ts` exposes:

```ts
export type ChecklistItemId =
  | 'bio_optimized'
  | 'profile_pic_pro'
  | 'cadence_consistent'
  | 'caption_hooks'
  | 'caption_ctas'
  | 'comment_replies'
  | 'hashtag_strategy'
  | 'content_variety'
  | 'bio_link_drives_click'
  | 'voice_consistent';

export type ChecklistScore = 'green' | 'yellow' | 'red' | 'na';

export type ChecklistItem = {
  id: ChecklistItemId;
  title: string;       // sentence case
  description: string; // one-line explanation
  score: ChecklistScore;
  note: string;        // short evidence string
  overridden: boolean;
};

export function computeScorecard(analysis: ProspectAnalysisRow): ScorecardSnapshot;
```

Rules (deterministic, all derived from SPY-03 fields):

| Item | Green | Yellow | Red | NA |
|---|---|---|---|---|
| bio_optimized | `bio_assessment.rating === 'good'` | `=== 'okay'` | `=== 'weak'` | `bio_assessment` null |
| profile_pic_pro | `profile_pic.rating === 'good'` | `=== 'okay'` | `=== 'weak'` | null |
| cadence_consistent | `posts_per_week >= 3` AND `trend !== 'declining'` | `posts_per_week >= 1.5` | `< 1.5` OR trend declining | trend === 'unknown' |
| caption_hooks | `hook_quality_avg >= 0.6` | `>= 0.4` | `< 0.4` | caption_pattern null |
| caption_ctas | `cta_rate >= 0.3` | `>= 0.15` | `< 0.15` | null |
| comment_replies | `reply_rate >= 0.2` | `>= 0.1` | `< 0.1` | comment_signal null |
| hashtag_strategy | (derived: ≥3 hashtags/post on ≥50%) | ≥1 hashtag on ≥50% | none | not detectable |
| content_variety | (derived from raw_captions clustering: ≥3 distinct topical clusters across last 15 posts) | 2 clusters | 1 cluster | <5 posts |
| bio_link_drives_click | `bio_assessment.cta` not null AND contains URL/handle | cta exists without URL | no cta | null |
| voice_consistent | `caption_pattern.voice_note` indicates consistency (string heuristic) | mixed | inconsistent | null |

Each rule lives in a pure function exported from `lib/prospects/checklist-rules/<id>.ts`. The aggregate `computeScorecard()` merges rule output with `overrides.checklist_overrides`. Override always wins.

## UI Components

### `app/admin/prospects/[id]/page.tsx` (modify)

Add a "Scorecard" section to the Analysis tab below the analysis card. Renders `<ScorecardOverridesPanel />` + `<GenerateScorecardButton />` + `<ScorecardShareLinkList />`.

### `components/prospects/scorecard-overrides-panel.tsx`

Server-renderable. Renders the 10 items as rows: title (left), score dot + label (middle), inline override controls (right: G/Y/R pills + note input). Saves through `PATCH /api/prospects/[id]/analysis`.

Props:
```ts
type Props = {
  prospectId: string;
  analysisId: string;
  items: ChecklistItem[];
};
```

Copy:
- Section title: "Scorecard"
- Override pill labels: "Improvement", "Okay", "Great" (sentence case alternatives to R/Y/G internal codes)
- Note placeholder: "Add a brief note (optional)"

Tokens: green = `text-emerald-500`, yellow = `text-amber-500`, red = `text-red-500`, na = `text-muted-foreground`.

### `components/prospects/generate-scorecard-button.tsx`

Client. POSTs to `/api/prospects/[id]/scorecard`, returns share URL + copy-to-clipboard.

Props: `{ prospectId: string; latestAnalysisId: string | null; canGenerate: boolean }`.

States:
- `idle` — Button "Generate scorecard PDF" (primary).
- `generating` — Spinner + "Generating..." (disabled).
- `done` — Inline panel showing share URL + Copy button + Open PDF button + "Generate new" link.
- `error` — Toast + retry.

Copy:
- Primary CTA: "Generate scorecard PDF"
- Generating: "Generating"
- Done copy success: "Link copied to clipboard"
- Open PDF: "Open PDF"
- New link CTA: "Generate new link"

### `components/prospects/scorecard-share-link-list.tsx`

Server-renderable list of `prospect_share_links` for this prospect. Rows: name (or "Untitled"), created_at, expires_at, views count (from `prospect_share_link_views`), Copy URL action, Archive action.

### `app/shared/prospect/[token]/page.tsx`

Public server component. No auth. Renders the scorecard read-only.

Layout:
- Top: brand favicon + brand_name + "@handle on tiktok" + generated date.
- 3-card summary row: counts of green / yellow / red items.
- 10-row checklist: dot + title + description + note.
- Bottom: "Want a deeper analysis?" CTA → mailto link with sales rep email (configurable env var `PROSPECT_SCORECARD_LEAD_EMAIL`).
- "Download PDF" button.

Copy:
- H1: `Audit prepared for {brand_name}`
- Summary subtitle: "10-point checklist for short-form social presence"
- Bottom CTA: "Want a deeper analysis? Email us"
- Download button: "Download PDF"

Theme: dark (matches admin), single column max-w-3xl, no admin nav chrome.

### `components/shared/prospect-scorecard-public.tsx`

Server-renderable card list, used by `app/shared/prospect/[token]/page.tsx`. Re-rendered server-side, no client interactivity.

### `app/shared/prospect/[token]/track-view.tsx`

Client component (`'use client'`) mounted in the public page that POSTs to `/api/shared/prospect/[token]/views` on mount + on `beforeunload` (with duration_ms).

### `lib/pdf/branded/adapters.ts` (modify)

Add `mapProspectScorecardToBranded(snapshot: ScorecardSnapshot, brand: { name; handle; platform; favicon }) → BrandedDocumentData`.

Returns sections:
1. Cover (brand name + handle + date + Nativz logo).
2. Summary (3 dot-counts).
3. 10 detail rows, one per item: title, score, note. Red items get extra "Why this matters" paragraph pulled from a hardcoded map.

### `lib/pdf/branded/document.tsx` (potentially modify)

If the existing template doesn't accept a "scorecard-rows" section variant, add it; reuse existing typography + colour system.

## File Map

Create:
- `supabase/migrations/279_prospect_share_links.sql`
- `lib/prospects/checklist.ts` — `computeScorecard()`, type exports
- `lib/prospects/checklist-rules/bio-optimized.ts`
- `lib/prospects/checklist-rules/profile-pic-pro.ts`
- `lib/prospects/checklist-rules/cadence-consistent.ts`
- `lib/prospects/checklist-rules/caption-hooks.ts`
- `lib/prospects/checklist-rules/caption-ctas.ts`
- `lib/prospects/checklist-rules/comment-replies.ts`
- `lib/prospects/checklist-rules/hashtag-strategy.ts`
- `lib/prospects/checklist-rules/content-variety.ts`
- `lib/prospects/checklist-rules/bio-link-drives-click.ts`
- `lib/prospects/checklist-rules/voice-consistent.ts`
- `lib/prospects/checklist.test.ts` — covers all 10 rules + override merge
- `lib/prospects/scorecard-storage.ts` — Supabase Storage helpers for `prospect-pdfs` bucket
- `app/api/prospects/[id]/scorecard/route.ts`
- `app/api/prospects/[id]/scorecard/archive/route.ts`
- `app/api/shared/prospect/[token]/route.ts`
- `app/api/shared/prospect/[token]/views/route.ts`
- `app/shared/prospect/[token]/page.tsx`
- `app/shared/prospect/[token]/track-view.tsx`
- `components/prospects/scorecard-overrides-panel.tsx`
- `components/prospects/generate-scorecard-button.tsx`
- `components/prospects/scorecard-share-link-list.tsx`
- `components/shared/prospect-scorecard-public.tsx`
- `tasks/ralph/spy-04-checklist-scorecard/progress.txt`

Modify:
- `lib/pdf/branded/adapters.ts` — add `mapProspectScorecardToBranded`
- `lib/pdf/branded/document.tsx` — accept scorecard section variant (only if existing template can't render rows; verify first)
- `lib/pdf/branded/types.ts` — add scorecard section type
- `app/admin/prospects/[id]/page.tsx` — mount overrides panel + generate button + share link list
- `lib/prospects/types.ts` — export `ScorecardSnapshot`, `ChecklistItem`, `ChecklistItemId`, `ChecklistScore`
- `lib/supabase/types.ts` (regen)

## Env Vars

New:
- `PROSPECT_SCORECARD_LEAD_EMAIL` — mailto target on public share-link footer (default `hi@nativz.io`).

Reuses:
- Supabase service role for storage upload + signed URL minting.

## Edge Cases

- **No succeeded analysis.** 422 with message "Run analysis first" before button is clickable; UI hides the button until analysis exists.
- **All 10 items score NA** (analysis was deeply partial). Button still works; PDF renders "Not enough data to grade" page with a "Re-run analysis" CTA.
- **PDF generation timeout (>10s).** Return 500 with `{ error: 'PDF generation failed, try again' }`; do NOT write share link row.
- **Storage upload failure.** Same: transactional — share link only written after storage succeeds.
- **Token collision.** UNIQUE constraint catches; retry with new token (up to 3).
- **Public viewer hits archived token.** 404, generic message "Link no longer available."
- **Public viewer hits expired token.** Same 404.
- **Public view tracking abuse** (refresh loops). Rate-limit by IP hash, 1 view/min/token.
- **Override after PDF generation.** Generates a NEW share link; old PDF unaffected.
- **Brand favicon 404.** Fall back to Nativz logo on cover.
- **Banned-topic phrase in scorecard note** (unlikely, but possible from SPY-03 override). Regex filter at PDF render time; replace with "Filtered note".
- **Two simultaneous generations.** Race possible; both succeed with distinct tokens. Acceptable.
- **Re-generation cost.** PDF gen has no LLM cost; only Storage IO. Effectively free; no rate limit needed beyond click-through debounce.

## Test Plan

Unit (Vitest):
- `lib/prospects/checklist.test.ts`: 30 cases, three per rule (green/yellow/red), plus 5 NA cases, plus override-merge cases.
- `lib/pdf/branded/adapters.test.ts`: snapshot the `mapProspectScorecardToBranded` output for a canonical analysis fixture.

Integration:
- `POST /api/prospects/[id]/scorecard` end-to-end: produces row + PDF blob + touchpoint.
- `GET /api/shared/prospect/[token]` returns correct shape; 404 on expired/archived.

E2E (Playwright):
- Tester opens prospect detail, generates scorecard, copies link, opens link in new context (no auth), sees scorecard.
- Archive link → public hit returns 404.
- Override an item → re-generate → public view reflects override.

Manual QA:
- Generate scorecards for 5 distinct prospects across niches. Compare PDFs visually — same template, different content.
- Send link to a coworker, confirm it loads on mobile + desktop.
- Verify download CTA delivers correct PDF.

## Architecture Wiring

- Reuses `prospect_analyses` from SPY-03 as the single source of truth for inputs.
- Reuses share-link pattern from `audit_share_links` (migration 095) — same column shape with `pdf_storage_path` and `scorecard_snapshot` additions.
- Reuses `lib/pdf/branded/` template + adapters per CONTEXT.md "Existing libs."
- Reuses Supabase Storage signed-URL pattern (existing in moodboard / branded PDF flow).
- Reuses touchpoint pattern from SPY-01.
- The public route `/shared/prospect/[token]` is purely server-rendered, no client auth, uses service role.
- SPY-09 presentation mode (`/present/[token]`) and SPY-10 digest (CTA pointing at scorecard) both consume share-link tokens minted here.

## Done When

- Migration 279 applied; both tables + indexes + RLS in place.
- `lib/prospects/checklist.ts` exports `computeScorecard()` returning 10 graded items.
- 5 prospects generate distinct PDFs; visual QA passes.
- Public share link loads in ≤ 1s server-side, with view ping recorded.
- Override flow re-generates correctly.
- Archive flow blocks public access.
- `npx tsc --noEmit` clean; `npm run lint` clean.
- progress.txt fully `[x]`.
