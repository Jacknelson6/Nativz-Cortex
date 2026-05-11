# PRD: SPY · 09 · Sales call presentation mode

> Spying → Prospect Pipeline · 09/10 · 2026-05-10

## Purpose & Value

The same prospect data, optimized for screen-share. A dark, large-type, single-focus surface that walks the prospect through their scorecard → competitor benchmark → opportunity → next step. No nav chrome, no admin gridlines. Pure conversation tool. The strategist looks polished, the prospect feels seen, and the deliverable becomes a re-watchable artifact.

## Problem

The current prospect detail page is built for the strategist — dense, multi-pane, optimized for inspection. On a screen-share with a prospect on Zoom, dense + multi-pane reads as cluttered and amateur. We need a presentation skin that flips the same data into a confident, theatrical view, plus a public token URL so the prospect can rewatch.

## Primary User

Sales rep mid-call, screen-sharing. The prospect, watching live and later via the public link.

## SMART Goals

- Presentation mode loads from cached prospect data in <1s (server-rendered, no client-side waterfall fetches).
- Large-type readable at 1080p Zoom call: min 24px body, ≥48px headings, ≥32px sub-headings.
- Hotkey-driven (arrow keys advance) so the rep doesn't fumble cursors mid-call.
- Public token mode: the same view shareable as a link valid 30 days post-call, with optional lead-capture submit.
- Sales rep runs at least one real demo using it within 1 week of ship.

## User Stories

- **US-01** — As a sales rep, from any prospect detail page, I click "Present" or hit `P` and the screen transitions to fullscreen presentation mode at `/admin/prospects/[id]/present`.
- **US-02** — As a sales rep, arrow keys advance / rewind through the panel sequence: cover → current state → vs competitors → biggest opportunity → 30-day plan → next step CTA.
- **US-03** — As a sales rep, I can copy a public link (`/present/[token]`) before/after the call so the prospect can rewatch.
- **US-04** — As a prospect watching the public link, I see the same flow with no nav, dark theme, with a "download scorecard PDF" CTA (reusing SPY-04 PDF) and an optional "want a deeper analysis?" lead capture at the end.
- **US-05** — As a strategist, I can pre-edit the LLM-drafted 30-day plan before the call (it's locked at the time I copy the public link).

## In Scope

- Route `app/admin/prospects/[id]/present/page.tsx` (internal, admin auth).
- Route `app/present/[token]/page.tsx` (public, token-gated).
- 6 panels in sequence (cover, current state, vs competitors, biggest opportunity, 30-day plan, next step).
- Hotkey nav (left/right/space arrows; Esc exits to admin detail).
- Public token reuses SPY-04 `prospect_share_links` with new `kind='presentation'` value.
- LLM-drafted 30-day plan via `lib/prospects/draft-30-day-plan.ts` — produces 3 action items pulled from "improvement" checklist scores.
- Editable plan panel on admin detail page; persisted to `prospect_analyses.thirty_day_plan` (JSONB) — schema extension within SPY-03's existing field if free, else a new migration column.
- Public link copy button + lead-capture form (POST `/api/shared/prospect-present/[token]/lead`).
- Dark theme by default; no admin chrome layout.

## Out of Scope

- Live editing during the call (read-only at presentation time).
- Annotations / drawing tools (defer).
- Per-panel custom theming per prospect (one theme v1).
- Autoplay mode (D-05).
- Multi-language.
- Custom domain hosting for public link.

## Resolved Decisions

- **D-01** — 30-day plan LLM-generated or strategist-edited? **→ LLM-drafted via Sonnet 4.5, then strategist-edited inline on the prospect detail page; the version is locked at the time the public link is minted (snapshot stored on the share link row).** Rationale: prospect should see the agreed plan, not whatever the LLM most recently generated.
- **D-02** — Public link expiry? **→ 30 days from creation.** Rationale: long enough to revisit, short enough to expire stale pitches.
- **D-03** — Lead capture on public link? **→ Yes, optional form at the end: name + email + free-text "what's most exciting". Submits to sales rep email via Resend.** Rationale: passive conversion path.
- **D-04** — Storage for the 30-day plan? **→ Reuse SPY-03 `prospect_analyses.thirty_day_plan JSONB` (add column via migration 283 ALTER if not present).** Rationale: stays with the analysis.
- **D-05** — Autoplay? **→ No v1; rep controls pacing.** Rationale: pacing is conversation-driven.
- **D-06** — Hotkeys? **→ Right/Space = next, Left = prev, Esc = exit, `P` to enter from detail page.** Rationale: standard.
- **D-07** — Public link token reuse SPY-04 share links table? **→ Yes; add `kind='presentation'` to existing `prospect_share_links`; separate token from scorecard share so analytics don't mix.** Rationale: one share-link surface.
- **D-08** — Per-panel transition animation? **→ Cross-fade 200ms; no slide.** Rationale: subtle, professional.
- **D-09** — Where does prospect see "Powered by Nativz"? **→ Cover panel footer + next-step panel footer.** Rationale: subtle co-brand.
- **D-10** — Client-facing copy uses "drops" or "posts"? **→ "Posts."** Rationale: per `feedback_drops_vs_posts.md`.
- **D-11** — Logo on cover? **→ Prospect brand logo (if known via SPY-01 audit) + small Nativz lockup; fallback Nativz only.** Rationale: makes prospect feel seen.
- **D-12** — What font sizes? **→ Cover headline 72px, section headlines 48px, body 24px, captions 16px.** Rationale: legible at Zoom 1080p.
- **D-13** — Mobile presentation? **→ Public link supports mobile (rep does not present on mobile); panels stack at narrow widths.** Rationale: rewatch use case.

## Data Model

**No new migration.** SPY-09 leans on schema shipped by SPY-03 and SPY-04:

- `prospect_analyses.summary JSONB` (SPY-03) stores the 30-day plan inside a `thirty_day_plan` key — no schema change.
- `prospect_share_links.kind TEXT` (SPY-04, no CHECK constraint per SPY-04 D-X) accepts new value `'presentation'`.
- `prospect_share_links.metadata JSONB` (SPY-04) stores the per-link `presentation_snapshot` payload.

If SPY-04 ships a CHECK constraint on `kind`, a tiny ALTER is required here; this PRD will absorb that into SPY-09 implementation as a one-line migration `283_spy09_share_link_kind.sql`. **Drift flag:** if SPY-10's `283` lands first, renumber to next free integer at implementation time.

Reads from:
- `prospects`, `prospect_socials` (cover panel data).
- `prospect_analyses` (current state + opportunity + plan).
- `prospect_competitor_benchmarks` (vs competitors).
- `prospect_share_links` (token + snapshot).

## Types

`lib/prospects/types.ts` additions:

```ts
export interface ThirtyDayPlanItem {
  id: string; // stable id, e.g. action_01
  title: string;        // <= 80 chars
  body: string;         // <= 240 chars
  rationale: string;    // why this matters, <= 200 chars
}

export interface ThirtyDayPlan {
  generated_at: string;
  items: ThirtyDayPlanItem[]; // exactly 3
  strategist_edited: boolean;
}

export interface PresentationSnapshot {
  cover: { brand_name: string; brand_logo_url: string | null; prepared_for_date: string };
  current_state: ScorecardSnapshot;
  vs_competitors: { prospectScore: number; competitorScores: Array<{ handle: string; score: number }> } | null;
  biggest_opportunity: { title: string; body: string };
  thirty_day_plan: ThirtyDayPlan;
  contact: { sales_rep_name: string; sales_rep_email: string };
}
```

## LLM Prompt: 30-day plan

`lib/prospects/draft-30-day-plan.ts`:

System prompt (Sonnet 4.5 via OpenRouter):

```
You are a short-form video content strategist drafting a 30-day improvement plan for a brand who just received an audit.

INPUTS:
- Brand name: {brand_name}
- Scorecard (10 checklist items with R/Y/G + notes): {scorecard_json}
- Bio + caption + comment analysis: {analysis_summary}

OUTPUT: exactly 3 ThirtyDayPlanItem objects as JSON. Each item:
- title: action-oriented, sentence case, <=80 chars, no em dashes.
- body: concrete steps, sentence case, <=240 chars.
- rationale: connect to a scored-R or scored-Y checklist item, <=200 chars.

RULES:
- Pick the 3 items with the highest impact ÷ effort. Drop items already scoring G.
- Avoid jargon. Speak to a brand owner, not an agency.
- Never reference "long-form" or "YouTube long-form". Short-form vertical only.
- No em or en dashes. Use commas/periods/parens/hyphens.
- Output strictly the JSON array, no preamble.
```

Temperature 0.4; max_tokens 1500.

## API Surface

### `POST /api/prospects/[id]/present/draft-plan`

```ts
// No body required
```

Response: `{ plan: ThirtyDayPlan }`.

Behavior: pulls latest analysis + scorecard, calls LLM, returns + persists to `prospect_analyses.thirty_day_plan`. Admin auth.

### `PATCH /api/prospects/[id]/present/plan`

```ts
const Body = z.object({
  items: z.array(z.object({
    id: z.string(),
    title: z.string().min(1).max(80),
    body: z.string().max(240),
    rationale: z.string().max(200),
  })).length(3),
});
```

Updates `prospect_analyses.thirty_day_plan` (sets strategist_edited=true).

### `POST /api/prospects/[id]/present/mint-link`

```ts
// No body
```

Response: `{ token, url, expires_at }`.

Mints `prospect_share_links` row with kind='presentation', expires_at=now+30d, snapshots current data into `presentation_snapshot`. Admin auth.

### `GET /api/shared/prospect-present/[token]`

No auth. Returns `PresentationSnapshot` from share-link row. 404 if expired/archived.

### `POST /api/shared/prospect-present/[token]/lead`

```ts
const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  notes: z.string().max(2000).optional(),
});
```

Sends lead-capture email via Resend to the prospect's owner sales rep. IP-hash rate limit 3/hour/token. Returns `{ ok: true }`.

## Components

### `components/prospects/present-mode-shell.tsx`

Server component; receives `PresentationSnapshot`; renders panel array + hotkey listener (client subcomponent).

```ts
{
  snapshot: PresentationSnapshot;
  variant: 'internal' | 'public';
}
```

### `components/prospects/present-panels/*.tsx`

One file per panel:
- `panel-cover.tsx`
- `panel-current-state.tsx`
- `panel-vs-competitors.tsx`
- `panel-biggest-opportunity.tsx`
- `panel-thirty-day-plan.tsx`
- `panel-next-step.tsx` (lead-capture form for public variant; CTA for internal)

Each panel is full-viewport, dark bg, large type per D-12.

### `components/prospects/present-hotkeys.tsx`

`'use client'`; listens for arrow keys, space, Esc. Updates URL hash `#panel=2` for deep linking.

### `components/prospects/thirty-day-plan-editor.tsx`

Admin-side editor on `/admin/prospects/[id]`; rows for each of the 3 items; "Regenerate" button (calls draft-plan API); "Save" button (calls PATCH).

### `components/prospects/present-mint-button.tsx`

Admin-only; mints presentation link, copies URL to clipboard, shows toast.

## Pages

### `app/admin/prospects/[id]/present/page.tsx`

Server component; admin auth; loads snapshot in-place (no DB share link needed for internal); renders PresentModeShell variant='internal'. No layout (uses minimal root layout).

### `app/present/[token]/page.tsx`

Server component; loads snapshot from share-link; renders PresentModeShell variant='public'. Tracks view via existing SPY-04 view-tracking pattern, repointed at kind='presentation' rows. No admin chrome.

## File Inventory

New files:
- `lib/prospects/draft-30-day-plan.ts`
- `lib/prospects/draft-30-day-plan.test.ts`
- `lib/prospects/snapshot-presentation.ts` (builds PresentationSnapshot from current data)
- `lib/prospects/snapshot-presentation.test.ts`
- `app/api/prospects/[id]/present/draft-plan/route.ts`
- `app/api/prospects/[id]/present/plan/route.ts`
- `app/api/prospects/[id]/present/mint-link/route.ts`
- `app/api/shared/prospect-present/[token]/route.ts`
- `app/api/shared/prospect-present/[token]/lead/route.ts`
- `app/admin/prospects/[id]/present/page.tsx`
- `app/present/[token]/page.tsx`
- `app/present/[token]/layout.tsx` (minimal, no admin chrome)
- `components/prospects/present-mode-shell.tsx`
- `components/prospects/present-hotkeys.tsx`
- `components/prospects/present-panels/panel-cover.tsx`
- `components/prospects/present-panels/panel-current-state.tsx`
- `components/prospects/present-panels/panel-vs-competitors.tsx`
- `components/prospects/present-panels/panel-biggest-opportunity.tsx`
- `components/prospects/present-panels/panel-thirty-day-plan.tsx`
- `components/prospects/present-panels/panel-next-step.tsx`
- `components/prospects/thirty-day-plan-editor.tsx`
- `components/prospects/present-mint-button.tsx`
- `tests/e2e/prospect-present.spec.ts`

Edited files:
- `lib/supabase/types.ts` (regen)
- `app/admin/prospects/[id]/page.tsx` (mount ThirtyDayPlanEditor + PresentMintButton + Present hotkey)

## Edge Cases

- No analysis yet → present route returns 422 with "Analyze prospect first".
- No benchmark yet → vs-competitors panel renders empty state "Benchmark not yet run".
- Plan never generated → admin sees "Generate 30-day plan" CTA in editor instead of rows.
- Public link expired → public page 410 with "This link has expired".
- Public link archived → 404.
- Mobile prospect viewing public link → panels stack vertically; hotkeys disabled; tap to advance.
- LLM returns invalid JSON → fall back to manual empty plan; surface error to admin.
- Rate-limited lead capture → 429 with "Please try again in a few minutes".
- Token collision (extremely unlikely) → regen with retry x3.

## Verify Gates

- `npx tsc --noEmit`
- `npx vitest run lib/prospects/draft-30-day-plan.test.ts`
- `npx vitest run lib/prospects/snapshot-presentation.test.ts`
- Apply migration via Supabase MCP.
- Visual QA at 1920×1080 (Zoom 1080p) for both internal + public.
- Visual QA at 390×844 (iPhone) for public.
- E2E: `tests/e2e/prospect-present.spec.ts`.
- Real sales-call dry run with a fake prospect (record in Notes).

## Done When

- Internal present mode renders + key-navigates cleanly across all 6 panels.
- Public link verified accessible incognito + on mobile.
- Visual QA at 1080p: typography + density read confidently.
- Sales rep runs at least 1 real demo using it (recorded in Notes).
- Lead-capture form sends email; verified inbound.
- Public link archives via SPY-04 archive endpoint flow; verified 410.
- Migration applied; types regenerated.

## Dependencies (Cross-PRD)

- SPY-03 must supply analysis + scorecard input.
- SPY-04 supplies the `prospect_share_links` table + view-tracking infra.
- SPY-05 supplies benchmark (optional; vs-competitors panel handles null).
