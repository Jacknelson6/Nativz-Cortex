# PRD: VFF · 05 · Intelligent video analysis

> Viral Format Finder · 05/10 · 2026-05-10

## Purpose & Value

Turn a gate-passing video (post-VFF-04) into structured format intelligence: hook type, narrative structure, archetype, pacing, a 2-3 sentence "why it works," a retention pattern descriptor, and an embedding for ranking. This is where Gemini Vision earns its keep and where the format library becomes more than a TikTok feed.

## Problem

A scraped video URL with a view count is not useful intelligence. The strategist wants "this is a comparison hook, list-of-three structure, b-roll voiceover archetype, fast-cuts pacing, with a three-second tension beat before the first comparison." Without that structure, the format library cannot be aggregated, searched, or pinned into Content Lab.

## Primary User

System pipeline. Strategist consumes the output through the card (VFF-08) and detail view (VFF-09).

## SMART Goals

- Analysis cost <= $0.02 per video on average.
- Latency p50 <= 15s, p95 <= 45s per video.
- Schema completeness: 100% of `analysis_status = 'analyzed'` rows have non-null `hook_type`, `structure`, `archetype`, `pacing`, `engagement_hook_descriptor`, `why_it_works`, `retention_pattern`, `embedding`.
- Slug match rate against the taxonomy (VFF-06): >=95% of analyzed videos pick an existing slug; <=5% trigger a proposal queue entry.
- Spot-check quality: >=85% of weekly 20-video samples rated "accurate or close enough" by Jack.

## User Stories

- **US-01** — As the system, when a video moves to `analysis_status = 'analyzing'`, Gemini analyzes its first 30s + caption + top 10 comments within 45s and writes structured fields back to `viral_videos`.
- **US-02** — As a strategist, the card subtitle and detail-view fields all populate from these LLM outputs.
- **US-03** — As a developer, I can re-run analysis on a single video via `npx tsx scripts/reanalyze-viral-video.ts <id> [--force]`.
- **US-04** — As the system, when the LLM proposes a slug not in the taxonomy, the row stores the proposed slug verbatim, status stays `'analyzed'`, and a `format_taxonomy_proposals` row is inserted (VFF-06 owns the proposal table).

## In Scope

- Helper `lib/analytics/analyze-viral-video.ts` exporting `analyzeViralVideo(videoId)`.
- Cron route `app/api/cron/format-analyze/route.ts` every 5 min draining `analysis_status = 'pending'` videos that PASSED the gate (i.e. transitioned to `'analyzing'` by VFF-04's gate; see D-01).
- Worker pulls up to 20 videos per run; concurrency capped at 3 simultaneous Gemini calls.
- Input plumbing: download video MP4, trim to first 30s using existing `lib/audit/analyze-videos.ts` patterns; fetch caption + top 10 comments from `raw_payload` (already persisted by VFF-03).
- Output writes the 7 structured fields + populates the `embedding` column via Gemini Embedding 001.
- Taxonomy enforcement: prompt is constructed with the current `viral_formats` taxonomy as a constrained enum; off-taxonomy slugs trigger a `format_taxonomy_proposals` insert.
- One-off CLI: `scripts/reanalyze-viral-video.ts`.
- Retry: failed runs marked `'failed'` with `gate_metadata.analysis_error` set; the cron re-tries up to 3 times via a `gate_metadata.analysis_attempts` counter.

## Out of Scope

- Translation of non-English captions (English-only v1).
- Multi-model ensembling (single-model v1).
- Reanalysis on taxonomy edit (manual CLI per video).
- Editing the LLM's analysis output via UI (read-only; strategist can dismiss in VFF-09, not edit).

## Resolved Decisions

- **D-01** — Where does the transition `'pending' → 'analyzing'` happen? **→ The VFF-04 gate updates status to `'analyzing'` on pass.** This PRD's worker selects `'analyzing'` rows (not `'pending'`), runs analysis, and transitions to `'analyzed'` or `'failed'`.
- **D-02** — Trim to 30s or full duration? **→ 30s.** Rationale: short-form hooks land in the first 15-30s; saves cost and latency.
- **D-03** — `hook_type` etc. open-ended strings or strict enum? **→ Strict enum against current `viral_formats.slug` taxonomy, with the LLM allowed to propose a new slug; proposals queue.** Rationale: aggregation requires shared labels; proposals keep taxonomy alive.
- **D-04** — Top comments sampling? **→ Top 10 by likes (or top 10 by recency if `like_count` missing).** Rationale: reveals audience reaction.
- **D-05** — Embedding input? **→ Concatenation of `why_it_works + engagement_hook_descriptor + retention_pattern`, max 2k chars.** Rationale: dense semantic signal; mirrors how strategist describes "why this works for my brand."
- **D-06** — `engagement_hook_descriptor` length cap? **→ 80 characters.** Rationale: card subtitle (VFF-08) needs to fit on one line.
- **D-07** — `why_it_works` length? **→ 2-3 sentences (60-280 chars).** Rationale: detail-view body; not a paragraph.
- **D-08** — When a video lacks an MP4 (only thumbnail available)? **→ Mark `'failed'` with `reject_reason = 'no_mp4_available'` after 3 attempts; do not waste Gemini calls on text-only.**
- **D-09** — Model? **→ `google/gemini-2.5-flash` via Gemini API directly using `GOOGLE_AI_STUDIO_API_KEY`.** Rationale: existing pattern (`lib/audit/analyze-videos.ts`).
- **D-10** — Where does the proposal table live? **→ Created in VFF-06 migration 276. This PRD writes to it but does not own its schema.** Rationale: keeps taxonomy ownership coherent.

## Data Model

No new tables. Reads + writes existing columns on `viral_videos` (from VFF-01). Writes to `format_taxonomy_proposals` (created by VFF-06).

Columns written:
- `analysis_status` ('analyzing' → 'analyzed' or 'failed')
- `analyzed_at`
- `title` (extracted from caption first line or LLM `engagement_hook_descriptor` fallback per VFF-08 D-01)
- `engagement_hook_descriptor`
- `why_it_works`
- `retention_pattern`
- `embedding`
- Joins into `viral_video_formats` for each of the 4 dimensions: one row per dimension with `source = 'llm'` and a `confidence` numeric.

## API Contracts

### `POST /api/cron/format-analyze`
Auth: `Authorization: Bearer ${CRON_SECRET}`.
Request: empty.
Response (200):
```ts
{
  processed: number;
  succeeded: number;
  failed: number;
  proposals_emitted: number;
  duration_ms: number;
  errors: Array<{ video_id: string; message: string }>;
}
```
Errors: 401, 500.

### Internal helper signature
```ts
async function analyzeViralVideo(videoId: string, opts?: { force?: boolean }): Promise<{
  status: 'analyzed' | 'failed';
  hook_type: string;
  structure: string;
  archetype: string;
  pacing: string;
  engagement_hook_descriptor: string;
  why_it_works: string;
  retention_pattern: string;
  proposals: Array<{ kind: 'hook_type' | 'structure' | 'archetype' | 'pacing'; slug: string }>;
  cost_usd: number;
  latency_ms: number;
}>;
```

## LLM Prompts

### Prompt: viral-video-analyze
Model: `google/gemini-2.5-flash` (Gemini API direct).
Temperature: 0.2.
Max output tokens: 1500.
Multi-part input: video file (first 30s, ~5MB max), caption text, comments JSON.

System:
```
You analyze a short-form video (TikTok / Reel / Short) for a marketing strategy library. Output STRICT JSON matching the schema. Pick the closest matching slug from each enum below; if NOTHING matches, propose a new lowercase_underscore slug AND include "propose": true in the corresponding output field's metadata block. Never invent facts about the brand or creator. Sentence case in free text fields. No em dashes, no en dashes. Banned content (return JSON with hook_type="banned" and all other fields empty): adult/NSFW, graphic violence, illegal activity tutorials, harassment.
```

User template:
```
PLATFORM: {platform}
CAPTION:
{caption}

TOP COMMENTS (by likes):
{comments_json}

DURATION: {duration_seconds}s (analyzing first 30s)

TAXONOMY (pick one slug per dimension or propose new):
hook_type: {hook_type_slugs_csv}
structure: {structure_slugs_csv}
archetype: {archetype_slugs_csv}
pacing: {pacing_slugs_csv}

Return JSON:
{
  "hook_type": { "slug": "<slug>", "confidence": 0..1, "propose": true | false },
  "structure": { "slug": "<slug>", "confidence": 0..1, "propose": true | false },
  "archetype": { "slug": "<slug>", "confidence": 0..1, "propose": true | false },
  "pacing": { "slug": "<slug>", "confidence": 0..1, "propose": true | false },
  "engagement_hook_descriptor": "<<=80 chars one-line subtitle starting with a verb>",
  "why_it_works": "<2-3 sentences, 60-280 chars total>",
  "retention_pattern": "<one short phrase describing narrative shape, e.g. 'tension-release-payoff'>",
  "title": "<short ASCII title or null>"
}
```

Output schema:
```ts
const AnalysisSchema = z.object({
  hook_type: z.object({ slug: z.string().min(1).max(60), confidence: z.number().min(0).max(1), propose: z.boolean() }),
  structure: z.object({ slug: z.string().min(1).max(60), confidence: z.number().min(0).max(1), propose: z.boolean() }),
  archetype: z.object({ slug: z.string().min(1).max(60), confidence: z.number().min(0).max(1), propose: z.boolean() }),
  pacing: z.object({ slug: z.string().min(1).max(60), confidence: z.number().min(0).max(1), propose: z.boolean() }),
  engagement_hook_descriptor: z.string().min(1).max(80),
  why_it_works: z.string().min(60).max(280),
  retention_pattern: z.string().min(3).max(80),
  title: z.string().min(1).max(120).nullable(),
});
```

Banned topics (model self-flag → row marked `'failed'` with `reject_reason = 'banned_content'`):
- Adult / NSFW
- Graphic violence
- Illegal activity tutorials (drug synthesis, weapons, hacking how-tos)
- Harassment / hate speech

## UI Components

None in this PRD. Output is consumed by VFF-08 + VFF-09.

## File Map

Create:
- `lib/analytics/analyze-viral-video.ts`
- `lib/analytics/analyze-viral-video.test.ts`
- `app/api/cron/format-analyze/route.ts`
- `scripts/reanalyze-viral-video.ts`
- `tasks/ralph/vff-05-video-analysis/progress.txt`

Modify:
- `vercel.json` (register `format-analyze` cron `*/5 * * * *`)
- `lib/audit/analyze-videos.ts` (extract a shared MP4 trimming helper if needed; verify before modifying — leave alone if already general-purpose)
- `lib/analytics/types.ts` (export `ViralAnalysisOutput` type)

## Env Vars

None new. Reuses `GOOGLE_AI_STUDIO_API_KEY`, `CRON_SECRET`.

## Edge Cases

- **Video file too large or download fails.** Up to 3 retries with exponential backoff (1s, 4s, 16s); on failure mark `'failed'` with `gate_metadata.analysis_error = 'mp4_unavailable'`.
- **Gemini returns malformed JSON.** Retry once with temperature=0; on second fail mark `'failed'` with `gate_metadata.analysis_error = 'malformed_output'`.
- **Gemini flags banned content.** Mark `'failed'` with `reject_reason = 'banned_content'`; do not insert format associations.
- **Caption non-English.** Pass-through; Gemini handles many languages; if `why_it_works` returns in another language, log and accept v1 (no translation).
- **All four dimensions propose new slugs.** Suspicious; log a warning and still accept; admin will batch-review.
- **`format_taxonomy_proposals` table does not yet exist (VFF-06 not shipped).** Helper checks for table existence on first run; if missing, store proposal in `gate_metadata.proposals` array and skip the table write.
- **Re-analysis with `--force`.** Deletes existing `viral_video_formats` rows for the video, then re-inserts; embedding overwritten.
- **Concurrent worker runs.** Cron route uses a SQL row-lock pattern: `UPDATE ... WHERE status = 'analyzing' AND id IN (...) RETURNING id` to claim rows; no Redis needed.
- **Embedding API failure.** Save analysis fields but with `embedding = null`; cron picks up on a later pass via a separate `'analyzed' AND embedding IS NULL` query (T11 covers this).

## Test Plan

Unit:
- `lib/analytics/analyze-viral-video.test.ts`:
  - Parses well-formed Gemini response.
  - Truncates `engagement_hook_descriptor` if model exceeds 80 chars.
  - Detects banned content and short-circuits.
  - Records proposals for off-taxonomy slugs.
  - Embedding failure path: status `'analyzed'`, embedding null, returns retry hint.

Integration:
- Apply migration 275 + run VFF-04 first (so videos transition to `'analyzing'`).
- Run cron, confirm at least 5 videos transition to `'analyzed'` with all 7 fields populated.
- Confirm proposals (if any) land in `format_taxonomy_proposals` (assuming VFF-06 already ran).

E2E: none.

Manual QA:
- Pick 5 random `'analyzed'` videos; spot-check `engagement_hook_descriptor` reads naturally and `why_it_works` is 2-3 sentences.
- Run `npx tsx scripts/reanalyze-viral-video.ts <id> --force`; confirm fields overwritten + embedding regenerated.

## Architecture Wiring

- Mirrors `lib/audit/analyze-videos.ts` for MP4 download + trim.
- Gemini call uses Gemini API directly (NOT OpenRouter) per `GOOGLE_AI_STUDIO_API_KEY` setup in `MEMORY.md`.
- Embedding uses `lib/ai/embeddings.ts` Gemini Embedding 001, 1536 dims.
- Proposal write into `format_taxonomy_proposals` (VFF-06 owns schema; this PRD documents the FK shape and writes through that table).

## Done When

- 50 videos analyzed end-to-end without intervention.
- Cost <= $0.02 per video averaged over 50 runs.
- p95 latency <= 45s.
- All 7 structured fields + embedding populated on 100% of `'analyzed'` rows.
- Spot-check quality >=85% Jack-approved.
- `npx tsc --noEmit` clean, `npm run lint` clean.
- progress.txt fully `[x]`.
