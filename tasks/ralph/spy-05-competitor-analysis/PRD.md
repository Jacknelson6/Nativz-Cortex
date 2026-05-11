# PRD: SPY · 05 · Competitor head-to-head benchmark

> Spying → Prospect Pipeline · 05/10 · 2026-05-10

## Purpose & Value

Reframe the prospect's scorecard from a solo verdict ("here are your weak spots") into a head-to-head ("here's where you're behind and ahead vs the field"). After SPY-04's PDF lands, a sales rep clicks "Run competitor benchmark"; in under 4 minutes Cortex picks 3 competitors, scrapes each, applies the same 10-item rubric, and renders a side-by-side comparison the rep can screen-share or attach as a "Round 2" section in the scorecard PDF.

## Problem

A solo R/Y/G grade is informative but not persuasive. Prospects argue with grades in a vacuum; they don't argue with "you're 40% behind your closest competitor on posting cadence and 60% ahead on engagement quality." We have the discovery + scrape pipeline from the audit work, plus the rubric from SPY-04; this PRD glues them to the prospect record.

## Primary User

Sales rep mid-pitch (consumes the head-to-head view). Strategist preparing the prospect package (curates competitor picks).

## SMART Goals

- Competitor discovery (auto-suggest 5 candidates, accept 3) completes within 30s.
- Full competitor scrape + benchmark p95 ≤ 4 min for 3 competitors.
- Head-to-head delta visible across all 10 checklist dimensions for ≥ 95% of runs.
- ≥ 70% of strategist spot-checks (n ≥ 10) rate competitor picks "right ones."
- Cost per run ≤ $1.20 (3 competitor scrapes at ~$0.30 each + 1 small LLM call for picker explanation).

## User Stories

- **US-01** — As a sales rep, after SPY-04 scorecard is generated I see a "Run competitor benchmark" CTA on the prospect detail page.
- **US-02** — As a sales rep, the discovery step shows 5 suggested competitors with brief rationales; I confirm 3 (or paste my own).
- **US-03** — As a sales rep, the run progresses with a single status pill ("Discovering" → "Scraping 1/3" → "Grading" → "Done") and a back-out button.
- **US-04** — As a sales rep, when complete I see a head-to-head table: 10 checklist rows × 4 columns (prospect + 3 competitors), each cell colour-dotted G/Y/R/NA, plus a top-line summary "You're behind on X items, ahead on Y."
- **US-05** — As a strategist, I can rerun the benchmark with a different competitor set if the picks miss.
- **US-06** — As a sales rep, regenerating the SPY-04 scorecard PDF now includes a "Round 2" page with the head-to-head table.

## In Scope

- Migration `280_prospect_competitor_benchmarks.sql`: `prospect_competitor_benchmarks` table.
- Discovery: reuse `lib/audit/discover-competitors.ts` (no new logic) wrapped in `lib/prospects/discover-competitors-for-prospect.ts` to thread prospect context.
- Confirm-competitors UI: mirror confirm-platforms pattern from `components/audit/audit-report.tsx`.
- Scrape: reuse `lib/audit/scrape-<platform>-profile.ts` per competitor.
- Grade: reuse `lib/prospects/checklist.ts#computeScorecard` from SPY-04 with a synthesised `ProspectAnalysisRow` for each competitor (via the same SPY-03 pipeline, simplified).
- Head-to-head view: prospect detail tab "Competitors" (was stub from SPY-01).
- PDF integration: when a benchmark exists, SPY-04's `mapProspectScorecardToBranded` appends a "Round 2" section.

## Out of Scope

- Recurring monitoring (SPY-06).
- Cross-prospect competitor sharing.
- Competitor-level video analysis (Format Finder series).
- "Industry average" phantom column (data is too sparse).
- Pre-built competitor catalogues per niche.

## Resolved Decisions

- **D-01** — Cap competitor count: 3 or 5? **→ 3 selected + up to 5 discovered options.** Rationale: matches audit Push C; cost stays ≤ $1.20.
- **D-02** — Benchmark in same PDF as scorecard? **→ Same PDF, "Round 2" section appended.** Rationale: one leave-behind asset.
- **D-03** — Strategist override on competitor picks? **→ Yes, free-text paste of 1 to 3 competitors (handle or URL) replaces or supplements the LLM picks before scraping.** Rationale: strategist taste beats LLM picks on niche brands.
- **D-04** — Re-run cadence limit? **→ 1 per 24h per prospect.** Rationale: scrape cost; manual override via admin tool.
- **D-05** — Storage shape: one row per benchmark run or one row per competitor cell? **→ One header row per benchmark in `prospect_competitor_benchmarks` with JSON columns for the 3 competitor analyses + computed deltas. Avoids a chatty join.** Rationale: a benchmark is a snapshot; readability over normalisation.
- **D-06** — Competitor analysis depth — full SPY-03 pipeline or lightweight? **→ Lightweight: scrape profile + last 15 posts + ≤30 comments, run only the 4 LLM steps needed to populate the 10 checklist rules. Skip Gemini Vision on competitor profile pics.** Rationale: cost + speed; profile-pic grade is low-info for competitors.
- **D-07** — Same `prospect_analyses` row for competitor? **→ No, competitor data lives entirely in `prospect_competitor_benchmarks.competitors` JSON. Don't pollute `prospect_analyses` (which is prospect-only).** Rationale: clean separation.
- **D-08** — How do we identify a competitor for de-dupe? **→ `(platform, normalised_handle)`.** Rationale: handles change less than URLs.
- **D-09** — When discovery returns < 5 picks? **→ Show what we got + a "Paste your own" input.** Rationale: don't fail the flow.
- **D-10** — Banned topics in LLM picker rationale? **→ Same list as SPY-03; regex filter on output.** Rationale: rationale may leak into UI/PDF.
- **D-11** — Cancelability? **→ Run is sync from the API call; client polls status. Cancel sets `cancelled_at` on the row and the server-side worker is no-op'd via `if (cancelled) return;` checks between scrape stages.** Rationale: simple, doesn't require a worker queue.

## Data Model

### Migration `280_prospect_competitor_benchmarks.sql`

```sql
-- ============================================================
-- SPY-05: Prospect competitor head-to-head benchmark
-- One row per benchmark run; competitor results stored as JSON.
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_competitor_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES prospect_analyses(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','discovering','scraping','grading','succeeded','partial','failed','cancelled')),
  error_message TEXT,
  duration_ms INTEGER,
  cost_cents INTEGER,
  cancelled_at TIMESTAMPTZ,

  -- Inputs
  picked_competitors JSONB DEFAULT '[]'::jsonb,   -- [{ platform, handle, profile_url, display_name, source: 'discovered'|'manual', rationale: string|null }]

  -- Output: competitor analyses + computed deltas
  -- Shape: { competitors: [{ handle, platform, scorecard: ScorecardSnapshot, raw_inputs: {...} }, ...], deltas: {...} }
  competitors JSONB DEFAULT '[]'::jsonb,
  deltas JSONB DEFAULT '{}'::jsonb,                -- { behind: ChecklistItemId[]; ahead: ChecklistItemId[]; tied: ChecklistItemId[] }

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_competitor_benchmarks_prospect_created
  ON prospect_competitor_benchmarks(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_competitor_benchmarks_status
  ON prospect_competitor_benchmarks(status) WHERE status IN ('pending','discovering','scraping','grading');

CREATE TRIGGER trg_prospect_competitor_benchmarks_updated
  BEFORE UPDATE ON prospect_competitor_benchmarks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE prospect_competitor_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY pcb_admin_all ON prospect_competitor_benchmarks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
```

## API Contracts

### `POST /api/prospects/[id]/benchmark/discover`

Auth: admin.
Route config: `export const maxDuration = 60;`

Request:
```ts
const RequestSchema = z.object({});
```

Behaviour: synchronously runs `discoverCompetitorsForProspect(prospectId)`; returns up to 5 candidate competitors with rationale strings.

Response (200):
```ts
{
  candidates: Array<{
    platform: 'tiktok'|'instagram'|'youtube'|'facebook';
    handle: string;
    profile_url: string | null;
    display_name: string | null;
    rationale: string;     // one sentence, no em dash
  }>;
}
```

### `POST /api/prospects/[id]/benchmark`

Auth: admin.
Route config: `export const maxDuration = 300;`

Request:
```ts
const RequestSchema = z.object({
  competitors: z.array(z.object({
    platform: z.enum(['tiktok','instagram','youtube','facebook']),
    handle: z.string().min(1).max(120),
    profile_url: z.string().url().nullable().optional(),
    display_name: z.string().max(200).nullable().optional(),
    source: z.enum(['discovered','manual']).default('manual'),
    rationale: z.string().max(280).nullable().optional(),
  })).min(1).max(3),
  force: z.boolean().default(false),    // bypass 24h limit
});
```

Behaviour:
1. Check 24h rate limit; 429 unless `force`.
2. INSERT benchmark row, status='discovering'.
3. Run lightweight per-competitor pipeline (scrape + 4 LLM calls + compute scorecard) in parallel.
4. Compute `deltas` (behind/ahead/tied per checklist item).
5. UPDATE benchmark row, status='succeeded' (or 'partial'/'failed').
6. Write touchpoint kind='note' body=`Competitor benchmark complete (N competitors)`.

Response (200): `{ benchmark: ProspectCompetitorBenchmarkRow }`.

Errors: 400, 401, 403, 404 prospect, 422 prospect lacks analysis, 429 rate-limited, 500.

### `GET /api/prospects/[id]/benchmark`

Auth: admin.

Query: `?id=<benchmark_id>` (optional; defaults to latest).

Response (200): `{ benchmark: ProspectCompetitorBenchmarkRow | null }`.

### `POST /api/prospects/[id]/benchmark/[benchmark_id]/cancel`

Auth: admin.

Behaviour: sets `cancelled_at = now()`, status='cancelled'. Worker checks between stages.

Response (200): `{ ok: true }`.

## LLM Prompts

### Prompt: `competitor-discovery-rationale`
Model: `anthropic/claude-sonnet-4.5`
Temperature: 0.4
Max tokens: 600

(Reuses `lib/audit/discover-competitors.ts`'s existing prompt, with an added single-sentence rationale per pick.)

System:
```
You suggest up to 5 short-form video competitors for a brand. For each suggestion include platform, handle, and a one-sentence rationale (max 140 chars, no em dash). Pick brands that compete on attention not just product (similar audience, similar format mix). Banned: politics, religion, health claims, weight loss, competitor disparagement.
```

User template:
```
Prospect: {brand_name}
Platform: {platform}
Bio: {bio_text}
Niche: {niche_or_inferred}
Top recurring themes from comments: {themes_csv}
```

Output schema:
```ts
const DiscoveryOutput = z.object({
  candidates: z.array(z.object({
    platform: z.enum(['tiktok','instagram','youtube','facebook']),
    handle: z.string().min(1).max(120),
    rationale: z.string().min(8).max(140),
  })).min(1).max(5),
});
```

The lightweight competitor pipeline reuses the four SPY-03 prompts (`bio-assessment`, `caption-pattern`, `comment-signal`, no `profile-pic-assessment`, plus the `rollup-observations` is SKIPPED for competitors — we only need the checklist input fields, not narrative observations).

## UI Components

### `components/prospects/competitor-benchmark-section.tsx`

Server-renderable wrapper. Mounted on prospect detail "Competitors" tab.

Props: `{ prospectId; latestBenchmark: ProspectCompetitorBenchmarkRow | null; canRun: boolean }`.

States:
- No prior benchmark: IconCard with "Run competitor benchmark" CTA.
- Running: `<BenchmarkProgress />` showing status pill + percent + cancel.
- Done: `<HeadToHeadTable />` + "Re-run" button.
- Failed: error card + retry.

### `components/prospects/run-benchmark-wizard.tsx`

Client. 3-step modal:
1. **Discover** — calls `/discover`, shows 5 cards with handle + platform + rationale; checkbox to include (max 3). "Add manual" footer expands a paste field.
2. **Confirm** — selected competitors shown + start button.
3. **Run** — progress UI.

Props: `{ prospectId; onComplete(benchmarkId): void }`.

Copy:
- Step 1 title: "Pick competitors"
- Step 1 subtitle: "We found these. Pick up to 3 or add your own."
- Manual input label: "Add another competitor (handle or URL)"
- Step 2 confirm CTA: "Start benchmark"
- Step 3 cancel: "Cancel run"
- Empty discovery: "No competitor suggestions, add one manually below."

### `components/prospects/benchmark-progress.tsx`

Client. Polls `/api/prospects/[id]/benchmark` every 3s. Shows status pill + per-stage check icons + ETA.

### `components/prospects/head-to-head-table.tsx`

Server-renderable. Renders 10 rows × 4 columns table:
- Header row: "" | Prospect | Comp 1 | Comp 2 | Comp 3 (handles truncated).
- Row 1 to 10: item title + score dot per column.
- Summary band at top: "You're behind on N items, ahead on M, tied on K."

Props:
```ts
type Props = {
  prospectName: string;
  prospectScorecard: ScorecardSnapshot;
  competitors: Array<{ handle: string; platform: string; scorecard: ScorecardSnapshot }>;
  deltas: { behind: ChecklistItemId[]; ahead: ChecklistItemId[]; tied: ChecklistItemId[] };
};
```

Layout: full-width table; sticky header; alternating row backgrounds via `bg-surface`/`bg-background`. On hover row, expandable "What this means" tooltip with the note from each cell.

Tokens: same R/Y/G as SPY-04.

### `app/admin/prospects/[id]/page.tsx` (modify)

Activate the "Competitors" tab content. Mount `<CompetitorBenchmarkSection />`.

## File Map

Create:
- `supabase/migrations/280_prospect_competitor_benchmarks.sql`
- `lib/prospects/discover-competitors-for-prospect.ts` (wraps `lib/audit/discover-competitors.ts`)
- `lib/prospects/grade-competitor.ts` (lightweight pipeline; reuses SPY-03 prompts minus profile-pic + rollup)
- `lib/prospects/grade-competitor.test.ts`
- `lib/prospects/benchmark-orchestrator.ts` (`runCompetitorBenchmark(prospectId, picks)`)
- `lib/prospects/benchmark-orchestrator.test.ts`
- `lib/prospects/compute-deltas.ts` (pure: prospect scorecard + comp scorecards → behind/ahead/tied)
- `lib/prospects/compute-deltas.test.ts`
- `app/api/prospects/[id]/benchmark/route.ts` (POST + GET)
- `app/api/prospects/[id]/benchmark/discover/route.ts`
- `app/api/prospects/[id]/benchmark/[benchmark_id]/cancel/route.ts`
- `components/prospects/competitor-benchmark-section.tsx`
- `components/prospects/run-benchmark-wizard.tsx`
- `components/prospects/benchmark-progress.tsx`
- `components/prospects/head-to-head-table.tsx`
- `tasks/ralph/spy-05-competitor-analysis/progress.txt`

Modify:
- `lib/prospects/types.ts` — add `ProspectCompetitorBenchmarkRow`, `CompetitorScorecard`, `BenchmarkDeltas`.
- `lib/pdf/branded/adapters.ts` — extend `mapProspectScorecardToBranded` to optionally append "Round 2" head-to-head section when a benchmark row is passed in.
- `app/admin/prospects/[id]/page.tsx` — activate Competitors tab.
- `app/api/prospects/[id]/scorecard/route.ts` — accept optional `include_benchmark_id` to thread the latest benchmark into the PDF.
- `lib/supabase/types.ts` (regen).

## Env Vars

None new.

## Edge Cases

- **Prospect has no SPY-03 analysis.** 422 with "Run analysis first."
- **Discovery returns 0 candidates.** UI surfaces "No suggestions found" + manual paste; orchestrator allows 1-3 manual picks.
- **Competitor handle resolution fails.** Mark that competitor `status='failed'` inside the JSON; benchmark row remains `status='partial'` if at least 1 succeeds, else `status='failed'`.
- **All 3 competitor scrapes fail.** Whole benchmark `status='failed'`; UI offers retry with different picks.
- **One competitor is privacy-locked.** Same as partial scrape: their column shows NA across the rubric.
- **Apify rate limit.** Exponential backoff 2 tries (5s, 20s) per scrape. If still failing, mark that competitor failed.
- **24h re-run limit.** API returns 429 with `retry_after_seconds`. UI tooltip shows wait time. Admin can pass `?force=true`.
- **Cancellation mid-run.** Set `cancelled_at`; orchestrator checks between stages and bails.
- **User pastes a competitor URL that matches the prospect.** Reject in Zod refinement (`refine(c => normaliseHandle(c.handle) !== prospect.primary_handle)`).
- **User adds duplicate competitor.** Dedupe via `(platform, normalised_handle)` in the orchestrator.
- **LLM rationale leaks banned term.** Same regex filter as SPY-03.
- **PDF regen with benchmark.** If benchmark exists and is `succeeded`, scorecard PDF auto-includes Round 2; if `partial`, includes available competitors only; if `failed`, omits the section.
- **Page reload mid-run.** Polling component resumes from latest status.

## Test Plan

Unit (Vitest):
- `lib/prospects/compute-deltas.test.ts`: cases where prospect green/comp red ⇒ ahead; prospect red/comp green ⇒ behind; both same ⇒ tied; NA participation handled correctly.
- `lib/prospects/grade-competitor.test.ts`: stubbed scrape + LLM, asserts ScorecardSnapshot returned.
- `lib/prospects/benchmark-orchestrator.test.ts`: 3 happy + 1 partial-success + 1 cancellation + 1 dedupe case.

Integration:
- `POST /api/prospects/[id]/benchmark/discover`: stubbed discovery returns 5 candidates with rationales.
- `POST /api/prospects/[id]/benchmark`: full pipeline against fixtures; row succeeded; deltas computed.
- Cancel mid-run causes status='cancelled'.

E2E (Playwright):
- Run benchmark from prospect detail; wizard picks 3; head-to-head table renders.
- Manual-paste path works.
- 24h rate-limit returns 429.

Manual QA:
- 10 prospects benchmarked. Strategist reviews competitor picks: ≥ 7/10 "right ones."
- PDF regen includes Round 2 section visually correct on 3 prospects.

## Architecture Wiring

- Reuses `lib/audit/discover-competitors.ts`, `lib/audit/scrape-<platform>-profile.ts`, `lib/audit/search-competitor-socials.ts`.
- Reuses SPY-03 prompts (`bio-assessment`, `caption-pattern`, `comment-signal`) via the new `lib/prospects/grade-competitor.ts`.
- Reuses SPY-04 `computeScorecard()` for each competitor.
- The benchmark row's `analysis_id` FK to `prospect_analyses` lets us cleanly track which prospect-side analysis was the basis of comparison.
- PDF integration extends SPY-04's adapter; SPY-04 only needs to accept an optional `benchmark` arg.
- "Competitors" tab on prospect detail was stubbed in SPY-01; this PRD activates it.
- Touchpoint pattern from SPY-01 reused.

## Done When

- Migration 280 applied.
- Discovery API returns 5 ranked picks with rationale in <30s.
- Full benchmark p95 ≤ 4 min for 3 competitors.
- Head-to-head table renders correctly on prospect detail.
- PDF re-gen includes Round 2 section when benchmark exists.
- 24h rate-limit enforced; force bypass works.
- Cancellation aborts mid-flight.
- 10-prospect strategist spot-check ≥ 7/10 right competitor picks.
- `npx tsc --noEmit` clean; `npm run lint` clean.
- progress.txt fully `[x]`.
