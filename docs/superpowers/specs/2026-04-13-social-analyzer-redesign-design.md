# Social Analyzer Redesign

**Date:** 2026-04-13
**Status:** Approved, ready for implementation plan
**Scope:** Rename, pipeline parallelization + video analysis, competitor landscape UI rework

## Problem

The social analyzer (formerly "audit") has three friction points on sales calls:

1. **Button label is vague.** After social profiles are detected and confirmed, the primary CTA still says "Start audit." It should reflect the action the user is actually about to take: running analysis.
2. **End-to-end takes ~3 minutes.** Scrapers are fast; the wall time is coming from sequential LLM calls and serial competitor website scrapes. A prospect tab open for 3 minutes is a conversion liability.
3. **Competitor comparison is scattered.** The current report forces the user to scroll and switch platform tabs to piece together the story. The numbers exist but the *narrative* — "you're losing here, you're winning here, this is where to fix it first" — has to be assembled in the seller's head.

## Goals

- Full-landscape competitor view on one page (you + up to 3 competitors across 4 platforms × ~13 scorecard categories), with a deterministic topline headline and 3 callout cards for the opening of a sales walkthrough.
- Total analysis wall time ~120s (down from ~180s), with Gemini video analysis *added* during that budget to enrich hook / variety / quality grades.
- Zero schema migrations — additive JSON shape inside the existing `prospect_audits` row.

## Non-goals

- Progressive reveal / streaming UI. Considered and rejected for this cut — adds UI complexity that the 120s budget does not require.
- Per-platform scorecard streaming. Kept as a single LLM call with all inputs staged.
- Historical trend analysis (week-over-week, month-over-month). Out of scope.
- Schema migration of the existing table / route names. `prospect_audits`, `/admin/analyze-social/*`, `/api/analyze-social/*` stay.

## Design

### 1. Rename "Start audit" → "Start analysis"

UI-only touchpoints:

- Entry button on `components/audit/audit-hub.tsx` (currently arrow icon with no visible text — add "Start analysis" label).
- "Start audit" button on the confirm-platforms screen: `components/audit/audit-report.tsx:390`.
- Page heading on `/admin/analyze-social` list view.
- Sidebar nav label: "Audit" → "Analysis."

Route (`/admin/analyze-social/*`), table (`prospect_audits`), and API (`/api/analyze-social/*`) stay unchanged. Rename churn there is not worth the migration risk.

### 2. Scorecard categories (13, grouped for adjacency)

Categories graded per run. Groups render in this order:

| Group | Categories | Scope |
|---|---|---|
| Performance | Engagement rate · Avg views · Follower-to-view ratio | per-platform |
| Cadence | Posting frequency · Cadence trend | per-platform |
| Content execution | Content variety · Content quality · Hook consistency | per-platform, Gemini-graded |
| Copy & metadata | Caption optimization · Hashtag strategy | per-platform |
| Profile & conversion | Bio optimization · CTA / conversion intent | account-level |
| Strategy | Platform focus | account-level |

**Status values:** `good` · `warn` · `poor`. Hashtag strategy is binary used/not used (green/red only, no amber).

**Cadence trend phrasing:**
- `up` → "↑ growing"
- `flat` → "→ stable"
- `down` → "↓ losing momentum" (explicit product copy; avoid "dying" / "declining")

### 3. Competitor landscape UI (Layout A: unified scorecard grid)

Top-to-bottom structure on the analysis report page:

**(a) Topline card**
- Headline: `"You're #N of 4 overall — losing leader by X%"` where N is the rank by overall score and X is the gap in overallScore points.
- If prospect is #1: `"You lead the category — widest gap on [top-winning metric]"`.
- Executive summary sentence: `"Strongest: [top good metric]. Weakest: [top poor metric]."`

**(b) Callout cards row (up to 3)**
- Deterministic selection:
  1. Filter scorecard to cells where prospect is `poor` AND at least one competitor is `good`.
  2. Rank by a weighted score: `posting_frequency`, `hook_consistency`, `cta_intent` carry double weight (the sales pitch).
  3. Take top 3. Tiebreak by widest numeric gap (e.g. posting frequency delta in posts/week).
- If fewer than 3 qualifying gaps, fill with neutral `warn` cells. If the prospect is leading everywhere, show up to 3 green "you're ahead" cards.
- Copy: `"No clear CTA in 7/10 videos"`, `"Losing momentum on TikTok (-18%)"`, etc. Written by the scorecard LLM into each `ScorecardItem.status_reason` field.

**(c) Account-level mini-grid**
- 3 rows: Platform focus · Bio optimization · CTA / conversion intent.
- Columns: You · Comp 1 · Comp 2 · Comp 3 (up to 3, as discovered).
- Each cell: status dot + short value text.

**(d) Per-platform blocks**
- One collapsed-by-default card per platform (TikTok · Instagram · Facebook · YouTube), expandable/collapsible header.
- Platforms the prospect is *not* on are hidden entirely.
- Each card contains a 10-row × (you + comps) table.
- Competitor columns render `—` for platforms that competitor is not on (do not inflate their lead with missing data).
- Default expanded state: all 4 platforms open. User can collapse.

**(e) Video gallery**
- Keep existing `AuditSourceBrowser` below the scorecard — unchanged behavior.

**Removed:**
- The existing 2-chart Recharts block (avg views + engagement rate bar charts) at `audit-report.tsx:704-749`. The grid carries the same numbers with less scrolling.

### 4. Pipeline parallelization

Updated `/api/analyze-social/[id]/process/route.ts` execution order:

```
1. scrape prospect website + extract context         (sequential, ~10s)
2. BRANCH ─ parallel:
   A: scrape prospect's 4 platforms                  (already Promise.allSettled)
   B: discover competitors (LLM) → scrape each       (serial per competitor, 150s budget)
3. JOIN A + B
4. Gemini video analysis on all brands in parallel   (concurrency 5, top 5 videos per brand per platform)
5. generateScorecard — single LLM call, receives all metadata + Gemini grades
6. Image persistence via `after()` (Vercel non-blocking) — does not gate the scorecard
```

Change from today's pipeline:
- **Before:** Step 5 (discover competitors) ran *after* step 4 (scrape prospect). Now overlaps.
- **Before:** Image persistence awaited before scorecard. Now deferred via `after()`.
- **Added:** Step 4 (Gemini video analysis) runs after scrape join and feeds scorecard.

Expected wall time: ~120s (was ~180s). Gemini adds ~20-30s but runs in parallel with any still-in-flight competitor scrapes.

### 5. Gemini video analysis

- **Model:** Gemini 2.5 Flash (existing integration per MEMORY; video input supported).
- **Selection:** Top 5 videos per brand per platform by view count.
- **Gating:** Only runs if that brand has ≥3 videos on that platform. Otherwise the three Gemini-graded rows (hook/variety/quality) render `—` with tooltip "not enough videos to grade."
- **Pattern reuse:** Concurrency-limited worker pool based on `lib/search/llm-pipeline/analyze-videos.ts` (existing, `CONCURRENCY = 5`).

**Per-video output schema:**
```ts
{
  hook_type: 'question' | 'stat' | 'story' | 'demo' | 'none',
  hook_strength: 1 | 2 | 3 | 4 | 5,
  format: string,            // e.g. "product close-up", "talking head", "montage"
  quality_grade: 'high' | 'medium' | 'low',
  visual_elements: string[], // short tags
}
```

**Aggregation → scorecard cells (per brand per platform):**
- `hook_consistency`: mode(hook_type) frequency / total. `>60%` good · `30-60%` warn · `<30%` poor.
- `content_variety`: distinct(format). `≥3` good · `2` warn · `1` poor.
- `content_quality`: avg(quality_grade mapped high=3/med=2/low=1). `≥2.3` good · `1.7-2.3` warn · `<1.7` poor.

### 6. Data model changes (additive JSON only)

All changes fit inside the existing `prospect_audits.analysis_data` JSONB column — no migration.

```ts
// lib/audit/types.ts
interface CompetitorProfile {
  // existing fields
  platforms?: Record<AuditPlatform, PlatformStats & {
    gemini_grades?: {
      hook_consistency: { value: number; status: ScoreStatus };
      content_variety: { count: number; status: ScoreStatus };
      content_quality: { avg: number; status: ScoreStatus };
    }
  }>;
}

interface ScorecardItem {
  // existing fields
  status_reason?: string; // short machine-written "why" for tooltip + callout copy
}

type ScorecardCategory =
  | 'posting_frequency'
  | 'cadence_trend'         // NEW
  | 'engagement_rate'
  | 'avg_views'
  | 'follower_to_view'
  | 'content_variety'
  | 'content_quality'
  | 'hook_consistency'      // NEW
  | 'caption_optimization'
  | 'hashtag_strategy'
  | 'bio_optimization'
  | 'cta_intent'            // NEW
  | 'platform_focus';       // NEW
```

## Testing

- **Unit:** scorecard aggregation helpers (hook consistency %, variety count, quality avg) pure functions — test with fixtures.
- **Integration:** one end-to-end run against a known prospect website with fixtures mocking Apify + Gemini. Assert the scorecard has all 13 categories and the topline/callouts fire deterministically.
- **Manual QA:** run against 3 real prospects (varying platform coverage: all 4, only TikTok+IG, only YouTube). Verify the grid hides empty platforms and shows `—` for missing competitor data.

## Rollout

Single branch. No feature flag — this is a direct replacement of the existing audit report UI. The existing `prospect_audits` rows that predate Gemini grading will render `—` in the three Gemini-graded rows (gating works the same as a brand with <3 videos). No backfill job required.

## Open questions

None — all design decisions resolved in brainstorm.
