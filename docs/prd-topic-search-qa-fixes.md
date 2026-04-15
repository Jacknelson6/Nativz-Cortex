# PRD: Topic Search QA Fixes (April 2026)

> **Status:** Approved — implementing phases 1–4 now; sources/auto-analysis deferred
> **Priority:** High (QA blockers on shipped feature)
> **Scope:** LLM pipeline prompts, results UI, ideas removal, Content Lab link

---

## Problem Statement

After QAing a Goldback topic search, four categories of issues were identified:

1. **Executive summary lacks temporal awareness** — references 2025 despite the current date being April 2026
2. **Content pillars are obscure + ideation pipeline UI is cluttered** — pillar names lack context; suggested hooks add noise; ideation panel has unnecessary subtext and topic search echo
3. **Inconsistent typography across results blocks** — font sizes, weights, and block designs vary between sections
4. **Sources are incomplete** — Reddit posts missing, web pages missing, TikTok volume too low (DEFERRED)

Additionally:
5. **Ideas feature removal** — Ideas pages and links stripped from admin + portal; ideas may live inside Content Lab later
6. **Source card click unification + auto-analysis** (DEFERRED to next phase)

---

## Decisions (from interview)

| # | Question | Answer |
|---|----------|--------|
| 1 | Date range in summary? | **Yes** — explicit date range (e.g., "January–March 2026") |
| 2 | Pillar stats? | **Keep** % of content, ER, Your ER |
| 3 | Pillar name format? | **Single clean line** — no headline/detail split. Name must be descriptive of the actual content type. |
| 4 | Content Lab route? | `/admin/content-lab` exists. Should open as `/admin/content-lab/{clientName}` with search context. |
| 5 | Ideas feature? | **Remove entirely.** Strip ideas pages + links from admin and portal. Ideas may surface inside Content Lab later. |
| 6 | Typography cards? | Not explicitly answered — keeping cards, just normalizing font sizes. |

---

## 1. Temporal Awareness in LLM Pipeline

### Current State
- The merger prompt says `Time scope: The user chose **${timeRangeLabel}**.`
- No current date injected. LLM hallucinates dates from training data.

### Changes
- Inject `Today's date: YYYY-MM-DD` into **planner**, **research**, and **merger** prompts.
- Add explicit instruction in merger summary:
  ```
  The executive summary MUST include an explicit date range header like "January–March 2026" based on today's date and the selected time window. All date references must be accurate relative to today's date. Never reference dates from training data.
  ```

### Files
- `lib/search/llm-pipeline/run-llm-topic-pipeline.ts` — 3 prompt injection points

---

## 2. Content Pillars + Ideation Pipeline UI

### 2a. Content Pillar Names — Single Descriptive Line

**Changes:**
- Update merger prompt to require descriptive, filmable content type names:
  ```
  Each "name" must be a single descriptive label (3–8 words) that clearly communicates WHAT type of short-form video content to produce.
  Good: "How-to tutorials & walkthroughs", "Behind-the-scenes production", "Product unboxing & first looks", "Quick tips & life hacks"
  Bad: "Community engagement", "Niche commentary", "Cultural relevance" — these describe themes, not filmable content.
  ```
- Remove `formatPillarLabelForDisplay()` headline/detail split — render name as single line.

### 2b. Remove Suggested Hook from Pillar Cards

- Remove hook display block, `pickHookForCategory()`, `cleanHookQuotes()`, and `hook` from data structure.
- Keep stats (% of content, ER, Your ER).

### 2c. Ideation Pipeline → Content Lab Link

**Replace the entire ideation pipeline panel** with a simpler card:
- Title: "Content Lab" (with Sparkles or Brain icon)
- No subtext, no step indicators, no topic search echo
- Single CTA button: "Open in Content Lab" → links to `/admin/content-lab/{clientSlug}?searchId={searchId}`
- If no client is attached, link to `/admin/content-lab?searchId={searchId}`

### 2d. Remove Ideas Feature

**Strip from admin + portal:**
- Remove ideas page routes (`/admin/ideas/*`, `/portal/ideas/*`)
- Remove "View ideas" links from results pages
- Remove ideas wizard modal triggers
- Remove linked ideas banner from results page
- Keep the API routes and database tables for now (data preservation) — just remove UI entry points

### Files
- `lib/search/llm-pipeline/run-llm-topic-pipeline.ts` — prompt changes
- `lib/search/format-pillar-label.ts` — simplify or remove
- `components/results/ai-takeaways.tsx` — remove hooks, simplify pillar display
- `components/ideation/ideation-pipeline-panel.tsx` — rewrite to Content Lab link
- `app/admin/search/[id]/results-client.tsx` — remove ideas wizard, linked ideas banner
- `app/portal/search/[id]/portal-results-client.tsx` — same
- Ideas page routes (identify and remove UI)

---

## 3. Typography & Block Design Standardization

### Target Standard

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Section heading | `text-lg sm:text-xl` | `font-semibold` | `text-text-primary` |
| Card title (inside card) | `text-base` | `font-semibold` | `text-text-primary` |
| Item name / label | `text-sm` | `font-medium` | `text-text-secondary` |
| Body / description | `text-sm` | `font-normal` | `text-text-muted` |
| Metric value | `text-sm` | `font-semibold tabular-nums` | `text-text-primary` |
| Micro label | `text-xs` | `font-medium uppercase tracking-wider` | `text-text-muted` |
| Progress bars | `h-2 rounded-full` | — | `bg-accent` on `bg-surface-hover` |

### Changes

**Emotions Breakdown** — Card title: `text-2xl` → `text-base font-semibold`
**Content Breakdown** — Tab labels: `text-base` → `text-sm`; item names: `text-lg` → `text-sm font-medium`; percentages: `text-base` → `text-sm`; progress bar: `h-2.5` → `h-2`
**Big Movers** — Type badge: `text-[10px]` → `text-xs`

Minimal changes only — normalize font scale, don't redesign layouts.

---

## 4–6. DEFERRED (Source Collection, Auto-Analysis, Source Click Unification)

These sections are documented but deferred to the next phase. See original PRD sections above for full specs.

---

## Implementation Order (This Phase)

1. **Temporal awareness** — inject dates into LLM prompts
2. **Content pillar names** — prompt tweak + remove headline/detail split + remove hooks
3. **Ideation pipeline → Content Lab link** — rewrite panel
4. **Remove ideas feature** — strip UI entry points from admin + portal
5. **Typography standardization** — surgical CSS normalization
