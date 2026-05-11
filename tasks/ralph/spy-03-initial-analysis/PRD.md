# PRD: SPY · 03 · Initial profile analysis (~90s actionable read)

> Spying → Prospect Pipeline · 03/10 · 2026-05-10

## Purpose & Value

Right after SPY-02 onboards a prospect, run a fast, focused read of their primary social profile that produces 3 to 5 concrete observations and one "biggest opportunity" callout in under 90 seconds for less than $0.10 per run. This is the free-value hook of the sales motion: the prospect didn't pay for it, but it lands in their inbox 24 hours later as the lead-in to a real conversation.

## Problem

The full audit (`prospect_audits` flow, ~4 to 5 min, several dollars in scrape + LLM cost) is too heavy for first-call prospecting. The strategist needs three or four sharp observations they can paraphrase on a follow-up call, not a 12-page report. There is currently no "between zero and full audit" tier.

## Primary User

Sales rep immediately after SPY-02 onboarding (auto-fire path). Strategist reviewing a cold prospect (manual re-run path).

## SMART Goals

- End-to-end analysis p95 ≤ 90s; p50 ≤ 60s.
- Cost per run ≤ $0.10 (Apify scrape + 1 Gemini Vision call + 1 OpenRouter Sonnet 4.5 call within ~6k tokens).
- Output: exactly 3 to 5 observations + 1 biggest opportunity, all populated for ≥ 95% of runs.
- ≥ 80% of strategist spot-checks (n ≥ 20) call observations "fair and accurate".
- Re-run rate-limited to 1 per prospect per 6 hours.

## User Stories

- **US-01** — As a sales rep, after SPY-02 onboarding I see "Analysis pending…" in the prospect detail; within ~90s it flips to a clean analysis card with profile pic assessment, bio assessment, caption pattern, comment signal, posting cadence, observations, biggest opportunity.
- **US-02** — As a strategist, I can open a prospect record and click "Re-run analysis" if the data feels stale, subject to a 6h rate limit.
- **US-03** — As a strategist, I can override any single auto-graded field via inline edit before generating the SPY-04 scorecard.
- **US-04** — As a developer, the analysis call is idempotent on `(prospect_id, run_id)`; partial failures don't write half-rows.
- **US-05** — As an admin, when an analysis fails (scrape error, LLM error), the prospect row shows `analysis_status='failed'` with a retry CTA and the error message.

## In Scope

- New migration `278_prospect_analyses.sql`: `prospect_analyses` table keyed by `(prospect_id, run_id)`.
- Orchestrator: `lib/prospects/initial-analysis.ts#runInitialAnalysis(prospectId)`.
- Pipeline steps (parallel where independent):
  1. Pick primary platform from `prospects.primary_platform` (fallback: TikTok > IG > YT > FB across `prospect_socials`).
  2. Scrape profile via `lib/audit/scrape-<platform>-profile.ts`.
  3. Profile picture → Gemini 2.5 Flash Vision for `professional|on-brand|messy` read.
  4. Bio → Sonnet 4.5 for hook + CTA + handle pattern.
  5. Last 10 to 15 captions → Sonnet 4.5 for hook quality, CTA rate, voice consistency.
  6. Last 50 top-level comments → Sonnet 4.5 for sentiment + recurring themes + reply rate.
  7. Posting cadence: compute deterministically from last 20 posts' timestamps.
- Single rollup Sonnet 4.5 call composes `observations[]` and `biggest_opportunity` from the structured findings.
- API: `POST /api/prospects/[id]/analyze` (manual re-run) and `GET /api/prospects/[id]/analysis` (read latest).
- UI: prospect detail Analysis tab fully wired; SPY-02's `<AnalysisPendingPill />` is replaced by `<ProspectAnalysisCard />` when complete.
- Per-field override inline (writes to `prospect_analyses.overrides` JSON).
- Rate limit: 1/6h, enforced in API + surfaced in UI.

## Out of Scope

- Scorecard checklist (SPY-04 owns; this PRD writes the source-of-truth fields it consumes).
- Competitor analysis (SPY-05).
- Multi-platform analysis (this PRD: primary platform only).
- Draft email body generation (defer to SPY-09 / SPY-10).
- PDF deliverable (SPY-04).
- Cross-prospect aggregates ("avg cadence in niche").

## Resolved Decisions

- **D-01** — Which platform is analysed? **→ `prospects.primary_platform` first; fallback priority TikTok > Instagram > YouTube > Facebook from `prospect_socials`.** Rationale: short-form first; matches SPY-02 default ordering.
- **D-02** — Multi-platform in one run? **→ No, single platform v1.** Rationale: full audit covers cross-platform; this is the fast read.
- **D-03** — Storage: one row per run or one row with versions? **→ One row per run; `prospect_analyses` rows accumulate; UI shows latest, history accessible via `?run_id=` query param later.** Rationale: cheap, debuggable, lets strategist compare runs over time.
- **D-04** — Re-run rate limit transport? **→ DB check on most-recent `prospect_analyses.created_at` for that prospect; if < 6h ago, return 429.** Rationale: simple, no external store.
- **D-05** — Override semantics? **→ Per-field; overrides stored in `prospect_analyses.overrides` JSON keyed by field path. Rendered values prefer override over base.** Rationale: preserves base for audit trail, doesn't mutate LLM output.
- **D-06** — Cost cap enforcement? **→ Soft: token budget ~6k tokens to Sonnet 4.5 + 1 Vision call. Hard cap via OpenRouter request body's `max_tokens`. No retry on LLM 5xx beyond 2 attempts.** Rationale: keeps cost predictable; alert on cost overage via existing dashboard.
- **D-07** — What if profile has <10 posts? **→ Run analysis with whatever exists; mark `posting_cadence.trend='unknown'`, observations note "limited post history."** Rationale: better incomplete than failed.
- **D-08** — What if profile is private? **→ Scrape returns sparse; analysis writes `analysis_status='partial'` with note "Profile is private or inaccessible." Strategist can retry once handle is corrected.** Rationale: surfaces problem without burning credits looping.
- **D-09** — Banned topics in LLM output? **→ No politics, religion, health claims, weight loss claims, or competitor disparagement.** Rationale: this output may end up in client-facing email per SPY-10; pre-filter.
- **D-10** — Where is the analysis tab visible? **→ Prospect detail page `Analysis` tab; v1 of SPY-01 stubs Tabs as Overview/Audit/Analysis/Competitors/Touchpoints; this PRD activates Analysis.** Rationale: consistent IA.
- **D-11** — When does the prospect's `lifecycle_state` advance? **→ On successful analysis completion, auto-advance `discovered` → `audited` (only that transition; later transitions stay manual). Writes touchpoint kind='state_change'.** Rationale: matches the mental model: "audited" = we know enough to talk to them.
- **D-12** — Trigger sources? **→ (1) Direct in-process call from SPY-02 confirm-socials route, (2) `POST /api/prospects/[id]/analyze` manual re-run.** Rationale: covers both async fire-and-forget and on-demand.
- **D-13** — Token caching? **→ Use OpenRouter's prompt caching (cache the system prompt; user template varies). Anthropic's 5-min TTL applies through OpenRouter.** Rationale: re-runs within session are cheaper.

## Data Model

### Migration `278_prospect_analyses.sql`

```sql
-- ============================================================
-- SPY-03: Initial profile analysis storage
-- One row per analysis run, keyed by (prospect_id, run_id).
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  run_id UUID NOT NULL DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','youtube','facebook')),
  handle TEXT NOT NULL,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','succeeded','partial','failed')),
  error_message TEXT,
  duration_ms INTEGER,
  cost_cents INTEGER,

  -- Raw scraped/computed inputs (so we can re-render without re-scraping)
  raw_profile JSONB DEFAULT '{}'::jsonb,
  raw_captions JSONB DEFAULT '[]'::jsonb,
  raw_comments JSONB DEFAULT '[]'::jsonb,

  -- Findings (null until succeeded/partial)
  profile_pic_assessment JSONB,    -- { rating: 'good'|'okay'|'weak', note: string, image_url: string }
  bio_assessment JSONB,             -- { hook: string|null, cta: string|null, rating: 'good'|'okay'|'weak', note: string }
  caption_pattern JSONB,            -- { hook_quality_avg: number, cta_rate: number, voice_note: string }
  comment_signal JSONB,             -- { sentiment_score: number, recurring_themes: string[], reply_rate: number }
  posting_cadence JSONB,            -- { posts_per_week: number, trend: 'climbing'|'flat'|'declining'|'unknown' }
  observations TEXT[],
  biggest_opportunity TEXT,

  -- Strategist overrides (per-field JSON map)
  overrides JSONB DEFAULT '{}'::jsonb,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_analyses_prospect_created
  ON prospect_analyses(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_analyses_status
  ON prospect_analyses(status) WHERE status IN ('pending','running');
CREATE UNIQUE INDEX IF NOT EXISTS uq_prospect_analyses_run
  ON prospect_analyses(prospect_id, run_id);

CREATE TRIGGER trg_prospect_analyses_updated
  BEFORE UPDATE ON prospect_analyses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: admin-only (same shape as prospects)
ALTER TABLE prospect_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospect_analyses_admin_all ON prospect_analyses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
```

## API Contracts

### `POST /api/prospects/[id]/analyze`

Auth: admin.
Route config: `export const maxDuration = 300; export const dynamic = 'force-dynamic';`

Request:
```ts
const RequestSchema = z.object({
  force: z.boolean().default(false),     // bypass 6h rate limit
});
```

Behaviour:
1. Look up prospect; 404 if missing.
2. Check most-recent `prospect_analyses` for this prospect; if `created_at` < 6h ago AND `!force` AND `status` IN ('succeeded','partial') → return 429.
3. INSERT new `prospect_analyses` row with `status='pending'`.
4. Call `runInitialAnalysis(prospect_id, run_id)` SYNCHRONOUSLY (route returns after completion).
5. On success: respond 200 with the analysis row.
6. On failure: row updated to `status='failed'`, respond 500 with `{ error: message }`.

Response (200):
```ts
{ analysis: ProspectAnalysisRow }
```

Errors: 400 invalid, 401, 403, 404 prospect, 429 rate limited, 500 internal.

### `GET /api/prospects/[id]/analysis`

Auth: admin.

Query: `?run_id=<uuid>` (optional, defaults to latest).

Response (200):
```ts
{ analysis: ProspectAnalysisRow | null }
```

Errors: 401, 403, 404 prospect.

### `PATCH /api/prospects/[id]/analysis`

Auth: admin.

Request:
```ts
const RequestSchema = z.object({
  run_id: z.string().uuid(),
  overrides: z.record(z.string(), z.unknown()),  // arbitrary key→value patches
});
```

Behaviour: merge `overrides` into `prospect_analyses.overrides`. Writes a touchpoint kind='note' body=`Analysis override: <field>`.

Response (200): `{ analysis: ProspectAnalysisRow }`.

Errors: 400, 401, 403, 404.

## LLM Prompts

### Prompt: `profile-pic-assessment`
Model: `google/gemini-2.5-flash`
Temperature: 0.2
Max tokens: 300

System:
```
You are a brand-design reviewer for short-form video creators. You will receive a profile picture image plus the brand name. Return one JSON object with fields rating (good|okay|weak), note (one sentence, max 140 chars, no em dash).

Criteria for good: clear subject, readable at small size, on-brand colours, professional.
Criteria for weak: blurry, illegible at thumbnail size, off-brand, generic stock.
Avoid: politics, religion, body-shaming, weight loss claims, health claims. If image is missing return rating=weak, note="No profile picture set."
```

User template:
```
Brand: {brand_name}
Platform: {platform}
Handle: @{handle}
Image: <attached>
```

Output schema:
```ts
const ProfilePicSchema = z.object({
  rating: z.enum(['good','okay','weak']),
  note: z.string().min(1).max(140),
});
```

Banned topics: politics, religion, health claims, weight loss, competitor disparagement.

### Prompt: `bio-assessment`
Model: `anthropic/claude-sonnet-4.5` via OpenRouter
Temperature: 0.3
Max tokens: 400

System:
```
You analyse short-form video creator bios. A good bio has a clear hook (first line), a clear CTA (link or action), and a consistent handle pattern. Return JSON: hook (verbatim first line or null if none stands out), cta (verbatim CTA or null), rating (good|okay|weak), note (one sentence, max 200 chars, no em dash).

Banned: politics, religion, health claims, weight loss claims.
```

User template:
```
Brand: {brand_name}
Platform: {platform}
Bio text:
"""
{bio_text}
"""
```

Output schema:
```ts
const BioSchema = z.object({
  hook: z.string().max(280).nullable(),
  cta: z.string().max(280).nullable(),
  rating: z.enum(['good','okay','weak']),
  note: z.string().min(1).max(200),
});
```

### Prompt: `caption-pattern`
Model: `anthropic/claude-sonnet-4.5`
Temperature: 0.3
Max tokens: 800

System:
```
You analyse a batch of recent video captions from one short-form creator. For each caption, score the hook quality (0 to 1) and whether a CTA is present. Then summarise voice in one sentence. Return JSON with hook_quality_avg (number 0 to 1), cta_rate (number 0 to 1), voice_note (max 200 chars, no em dash).

Banned: politics, religion, health claims, weight loss, competitor disparagement.
```

User template:
```
Brand: {brand_name}
Platform: {platform}
Captions:
{captions_as_numbered_list}
```

Output schema:
```ts
const CaptionPatternSchema = z.object({
  hook_quality_avg: z.number().min(0).max(1),
  cta_rate: z.number().min(0).max(1),
  voice_note: z.string().min(1).max(200),
});
```

### Prompt: `comment-signal`
Model: `anthropic/claude-sonnet-4.5`
Temperature: 0.3
Max tokens: 800

System:
```
You analyse the sentiment and recurring themes in a sample of top-level comments on a creator's recent posts. Return JSON with sentiment_score (-1 to 1; positive is supportive), recurring_themes (3 to 5 short noun phrases), reply_rate (number 0 to 1 indicating how often the creator replied to commenters; rely on the input to determine this). No em dash. Banned: politics, religion, health claims.
```

User template:
```
Creator: {brand_name}
Platform: {platform}
Comments (one per line, creator replies marked with [REPLY]):
{comments_as_lines}
```

Output schema:
```ts
const CommentSignalSchema = z.object({
  sentiment_score: z.number().min(-1).max(1),
  recurring_themes: z.array(z.string().max(80)).min(0).max(8),
  reply_rate: z.number().min(0).max(1),
});
```

### Prompt: `rollup-observations`
Model: `anthropic/claude-sonnet-4.5`
Temperature: 0.4
Max tokens: 600

System:
```
You synthesize a short-form-creator audit into 3 to 5 concrete observations and one biggest opportunity. Each observation: imperative, specific, max 140 chars, no em dash. Biggest opportunity: one paragraph max 280 chars, frame as growth lever (not criticism). Banned: politics, religion, health claims, weight loss claims, competitor disparagement.

Voice: confident, plainspoken, concrete. No marketing fluff ("synergy", "leverage", "10x"). Sentence case.
```

User template:
```
Brand: {brand_name}
Platform: {platform}
Profile pic: {profile_pic_summary}
Bio: {bio_summary}
Caption pattern: {caption_summary}
Comment signal: {comment_summary}
Posting cadence: {cadence_summary}
```

Output schema:
```ts
const RollupSchema = z.object({
  observations: z.array(z.string().min(8).max(140)).min(3).max(5),
  biggest_opportunity: z.string().min(40).max(280),
});
```

## UI Components

### `components/prospects/prospect-analysis-card.tsx`

Server-renderable wrapper that picks latest `prospect_analyses` row by `prospect_id` and renders sub-cards.

Props: `{ prospectId: string; latestAnalysis: ProspectAnalysisRow | null; canRerun: boolean; lastRunAt: string | null }`.

Layout:
- Top row: H2 "Initial analysis", subtitle showing handle + platform + "Last run {relative}", primary CTA "Re-run analysis" (disabled if `!canRerun`, tooltip showing time-until-next-allowed).
- 2-col grid (md+) of 5 IconCards: Profile picture, Bio, Captions, Comments, Posting cadence.
- Below grid: SectionPanel "Observations" with bulleted list.
- Below that: IconCard "Biggest opportunity" with single bold paragraph.
- Empty/partial state: render IconCard with `AlertTriangle` + error message + Retry button.

Copy:
- H2: "Initial analysis"
- Re-run button: "Re-run analysis"
- Disabled tooltip: "Available in {time_remaining}"
- Empty state title: "Analysis pending"
- Empty state body: "We're scanning the profile. This usually takes about a minute."
- Failed title: "Analysis failed"
- Failed body: shows `error_message`; retry button.

Tokens: `bg-surface`, `accent-text` for headings, `text-emerald-500` / `text-amber-500` / `text-red-500` for rating dots (these three are the only allowed ratings beyond brand tokens, per sentiment-bar carve-out).

### `components/prospects/profile-pic-card.tsx`

Client. Props: `{ assessment: ProfilePicAssessment; overrides?: Partial<ProfilePicAssessment>; onOverride(patch): void }`.

Renders: thumbnail (square 120px) of image_url, rating dot + label, note text below, inline-edit pencil icon top-right.

### `components/prospects/bio-card.tsx`
Same shape, fields hook + cta + rating + note.

### `components/prospects/caption-pattern-card.tsx`
Renders: two number stats (hook_quality_avg as 0-100%, cta_rate as 0-100%) with bar visualisations, voice_note as caption below.

### `components/prospects/comment-signal-card.tsx`
Renders: sentiment_score as sentiment-split-bar (existing component, emerald/red carve-out), recurring_themes as pill row, reply_rate as percentage.

### `components/prospects/posting-cadence-card.tsx`
Renders: posts_per_week as headline number, trend icon (ArrowUp / ArrowRight / ArrowDown) + trend label.

### `components/prospects/observations-list.tsx`
Server-renderable. Props: `{ observations: string[]; overrides?: { observations?: string[] }; onEdit?(idx, value): void }`.

### `components/prospects/biggest-opportunity-card.tsx`
Renders: paragraph in larger type, edit pencil for strategist override.

### `app/admin/prospects/[id]/page.tsx` (modify)

Activate the Analysis tab content (previously a stub from SPY-01). Mount `<ProspectAnalysisCard />` server-side; pass `latestAnalysis` from a `getLatestAnalysis(prospectId)` query.

## File Map

Create:
- `supabase/migrations/278_prospect_analyses.sql`
- `lib/prospects/initial-analysis.ts` — `runInitialAnalysis(prospectId): Promise<{ ok: true; analysisId: string } | { ok: false; error: string }>`
- `lib/prospects/initial-analysis-prompts.ts` — exports the four prompt builders + Zod output schemas
- `lib/prospects/initial-analysis.test.ts` — pipeline tests with stubbed scrape/LLM
- `lib/prospects/analysis-queries.ts` — `getLatestAnalysis`, `getAnalysisById`, `canRerun`
- `app/api/prospects/[id]/analyze/route.ts`
- `app/api/prospects/[id]/analysis/route.ts`
- `components/prospects/prospect-analysis-card.tsx`
- `components/prospects/profile-pic-card.tsx`
- `components/prospects/bio-card.tsx`
- `components/prospects/caption-pattern-card.tsx`
- `components/prospects/comment-signal-card.tsx`
- `components/prospects/posting-cadence-card.tsx`
- `components/prospects/observations-list.tsx`
- `components/prospects/biggest-opportunity-card.tsx`
- `tasks/ralph/spy-03-initial-analysis/progress.txt`

Modify:
- `lib/supabase/types.ts` (regen)
- `app/admin/prospects/[id]/page.tsx` (mount Analysis tab)
- `lib/prospects/types.ts` (export `ProspectAnalysisRow`, sub-field types)

## Env Vars

None new. Reuses:
- `OPENROUTER_API_KEY` (Sonnet calls)
- `GOOGLE_AI_STUDIO_API_KEY` (Gemini Vision)
- `APIFY_TOKEN` (scrapers)

## Edge Cases

- **Profile is private.** Scraper returns sparse JSON. Pipeline marks `status='partial'`, fills `error_message='Profile is private or inaccessible'`, skips LLM calls, returns null for findings. UI shows partial state with retry CTA.
- **Profile has <3 posts.** Caption-pattern and posting-cadence both populate with `note='Limited post history'`, `trend='unknown'`. Rollup still runs and explicitly notes the small sample.
- **Profile has 0 comments scraped.** Comment signal returns `sentiment_score=0`, `recurring_themes=[]`, `reply_rate=0`, note "No recent comments to analyse."
- **LLM returns malformed JSON.** Validate via Zod; on parse fail, retry once with a `<reminder>` system instruction. On second failure, mark that single field as null, continue rollup. Don't fail the whole run.
- **LLM returns banned-topic phrase.** Post-validation regex scan for the banned topic list (`/abortion|religion|weight loss|cure|miracle|diet pill/i`); on hit, blank that field, set `note='Filtered'`, log to telemetry.
- **Profile pic URL 404s mid-pipeline.** Skip Gemini Vision step; profile_pic_assessment becomes `{ rating: 'weak', note: 'Could not load profile image', image_url: null }`.
- **OpenRouter rate-limited (429).** Exponential backoff 2 tries (1s, 4s). If still failing, partial result.
- **Network timeout on scrape.** Each scrape capped at 30s. On timeout, write `error_message='Scrape timed out'`, status='failed'.
- **Rate-limited re-run.** API returns 429 with `{ error: 'Rate limited', retry_after_seconds: <number> }`. UI tooltip surfaces the wait time.
- **`prospect.primary_platform` is null AND `prospect_socials` is empty.** Pipeline returns 422 immediately with `{ error: 'No social handle to analyse' }`.
- **Two simultaneous analyses for same prospect.** Acceptable; each writes its own row. UI shows latest.
- **`runInitialAnalysis` called for a prospect that no longer exists** (deleted mid-flight): bail early, no-op.
- **Cost overage.** Telemetry hooks into `cost_cents`; if any run > 50¢ (5x budget) emit a warning log.

## Test Plan

Unit (Vitest):
- `lib/prospects/initial-analysis.test.ts`: 12 fixture-driven cases covering happy path, private profile, <3 posts, malformed LLM JSON, banned-topic filter, rate-limit return, override merging.
- `lib/prospects/initial-analysis-prompts.test.ts`: snapshot the rendered prompt for each of the 4 LLM calls with a canonical fixture so changes are reviewed.
- `lib/prospects/analysis-queries.test.ts`: `canRerun` returns false when latest succeeded <6h ago and `force=false`.

Integration:
- `POST /api/prospects/[id]/analyze`: full pipeline against stubbed scrapers (cached HTML/JSON in `tests/fixtures/spy-03/`), asserts row write + state advance from `discovered` → `audited`.
- `PATCH /api/prospects/[id]/analysis`: override write, touchpoint write.

E2E (Playwright):
- Trigger analysis from SPY-02 confirm screen, watch Analysis tab populate within 90s (use longer test timeout).
- Re-run within 6h shows tooltip; force flag (admin tool) bypasses.
- Override a field, refresh, override persists.

Manual QA:
- Run on 20 real prospects across e-commerce, creator, B2B. Record cost per run via `cost_cents`. Eyeball quality of observations.
- Strategist spot-check pass: 80% must agree observations are fair.

## Architecture Wiring

- New `lib/prospects/initial-analysis.ts` is the orchestrator; it's the function SPY-02's confirm-socials route fires.
- Reuses `lib/audit/scrape-*-profile.ts` per CONTEXT.md (no new scrapers).
- Reuses `lib/audit/persist-scraped-images.ts` to cache `profile_pic_assessment.image_url` into Supabase Storage so the UI doesn't hotlink.
- Reuses OpenRouter client pattern from `lib/nerd/` (verify the helper module before importing).
- Reuses Gemini Vision client from existing audit + knowledge layer.
- Writes touchpoint on completion (kind='state_change', body=`Initial analysis complete`); writes another on lifecycle auto-advance.
- Activity log entry: `prospect_analyzed` (mirrors existing pattern in `app/api/activity/`).
- Analysis tab on prospect detail consumes via server-side `getLatestAnalysis()` call.

## Done When

- Migration 278 applied; `prospect_analyses` table exists with RLS.
- `runInitialAnalysis()` returns within 90s p95 for 20 real prospects.
- Cost per run ≤ $0.10 verified via `cost_cents` telemetry across 20 runs.
- Analysis card renders all 5 sub-cards + observations + biggest opportunity.
- Override flow writes to `overrides` JSON and re-renders.
- Rate limit 1/6h enforced; force flag bypasses.
- Auto state advance `discovered` → `audited` writes touchpoint.
- 20-prospect strategist spot-check: ≥16/20 "fair and accurate."
- `npx tsc --noEmit` clean; `npm run lint` clean.
- progress.txt fully `[x]`.
