# PRD: VFF · 04 · Junk filter (cheap gate before deep analysis)

> Viral Format Finder · 04/10 · 2026-05-10

## Purpose & Value

Gemini Vision analysis is the expensive step. Sending every scraped video into it would burn budget on irrelevant, off-format, or low-quality content. This PRD inserts a two-stage cheap gate between sourcing (VFF-03) and analysis (VFF-05): a sync heuristic pass plus a cheap LLM topical pass on caption + first-frame. The gate aims to drop ~55% of incoming videos at well under one cent per rejection.

## Problem

Of every 100 short-form videos scraped, roughly 55 are noise: reposts and Stories overflow, ads with junk engagement signals, over-format talking heads, and off-topic content for the brand. Analyzing them costs money AND pollutes the Netflix rows with low-quality cards.

## Primary User

System gate. Strategist benefits indirectly through cleaner format rows. Admin reviews rejects in a paginated grid.

## SMART Goals

- >=55% rejection rate across the first 1000 videos through the gate (logged via `viral_videos.analysis_status = 'rejected'`).
- False-reject rate <=5% on a weekly 20-video admin spot-check.
- Cost per rejection <= $0.001 for heuristic rejects; <= $0.005 for LLM rejects.
- Gate latency p95 <= 2.5s per video (heuristic <50ms; LLM <2s).

## User Stories

- **US-01** — As the system, when a `viral_videos` row enters `analysis_status = 'pending'`, the gate decides within 2.5s whether to advance to `'analyzing'` or mark `'rejected'` with a `reject_reason`.
- **US-02** — As an admin, I can open `/admin/formats/rejected` and see a paginated grid of rejected videos with reason badges, a thumbnail, and a "Restore" button.
- **US-03** — As a developer, I can read `viral_videos.reject_reason` to debug any rejection (heuristic code OR LLM verdict + 1-line reason).
- **US-04** — As an admin, clicking "Restore" sets `analysis_status = 'pending'`, clears `reject_reason`, and re-queues the row.

## In Scope

- Migration 275 adding `reject_reason TEXT` and `gate_metadata JSONB` to `viral_videos` (column may already exist from VFF-01, in which case migration is a no-op `ADD COLUMN IF NOT EXISTS`).
- Helper `lib/analytics/junk-filter.ts` exporting `gateVideo(video, brandSeeds)` returning `{ pass: boolean; reason?: RejectReason; metadata: object }`.
- Heuristic gate (sync, no LLM):
  - `views < 10_000` → `low_views`
  - `duration_seconds > 90` → `too_long`
  - `duration_seconds < 5` → `too_short`
  - `engagement_rate < 0.01 AND views < 50_000` → `low_engagement` (ER = `(likes+comments+shares+saves) / max(views, 1)`)
  - `raw_payload.is_ad === true || raw_payload.sponsorshipInfo?.length > 0` → `paid_ad`
  - `raw_payload.is_repost === true` → `reposted`
- LLM gate (only if heuristic passed):
  - Model: `openai/gpt-5.4-mini` via OpenRouter (closest cheap general model available; verify exact slug at implementation time and fall back to `anthropic/claude-haiku-4` if not available).
  - Input: caption + thumbnail URL + brand seed list.
  - Output: `{ is_short_form_video: boolean, is_on_brand: boolean, reason: string }`.
  - Reject if either flag is false; reason becomes `not_short_form` or `off_topic` with the LLM's one-liner stored in `gate_metadata.llm_reason`.
- Background worker: cron route `app/api/cron/format-gate/route.ts` (every 5 min) draining the pending queue, max 100 videos per run.
- Admin review surface (this PRD only; rendered as a sub-route of /admin/formats which is empty until VFF-07):
  - `app/admin/formats/rejected/page.tsx`
  - `GET /api/admin/formats/rejected` (paginated)
  - `POST /api/admin/formats/rejected/[id]/restore`
- Reject reason enum in `lib/analytics/types.ts`.

## Out of Scope

- Re-grading already-rejected videos automatically (manual restore only).
- Per-brand custom heuristic thresholds (env-tunable globals v1).
- Threshold-tuning UI (env vars only).
- A/B testing the LLM gate prompt (manual prompt iteration).

## Resolved Decisions

- **D-01** — One combined LLM call or per-brand pair? **→ One combined call using the merged seed list.** Rationale: cheaper; ranking handles per-brand fine-tuning later.
- **D-02** — Engagement-rate denominator? **→ Views.** Rationale: matches `feedback_analytics_brand_pill_only.md`-adjacent rule; views are stable, follower count is profile-level not post-level.
- **D-03** — Retention or completion rate in heuristics? **→ Skip v1.** Rationale: Apify rarely exposes per-video retention; missing-field-safe approach is cleaner.
- **D-04** — Cheap LLM model? **→ `openai/gpt-5.4-mini` primary, `anthropic/claude-haiku-4` fallback.** Rationale: cheapest reliable JSON-mode generalist via OpenRouter at time of writing; both gated behind the same `lib/ai/openrouter-rich.ts` wrapper.
- **D-05** — Where does the gate run? **→ Separate cron `/api/cron/format-gate` every 5 min draining `analysis_status = 'pending'`.** Rationale: keeps sourcing cron fast; decouples failure domains.
- **D-06** — Concurrency? **→ Up to 10 in parallel per run; max 100 videos per run.** Rationale: stays within OpenRouter rate limits; bounded run time.
- **D-07** — How are restored videos handled? **→ Re-enter `'pending'`, clear `reject_reason`; gate may re-reject if heuristics still fail.** Rationale: simplest; admin should only restore false rejects.
- **D-08** — Where do gate metadata fields live? **→ Add `gate_metadata JSONB` column.** Rationale: `reject_reason` is the short slug; metadata holds heuristic numbers + LLM JSON for forensics.
- **D-09** — RLS on `/admin/formats/rejected`? **→ Admin-only (mirrors VFF-01).** Rationale: review surface is staff-only.

## Data Model

### Migration `275_viral_videos_reject_columns.sql`

```sql
-- ============================================================
-- VFF-04: Reject reason + gate metadata on viral_videos
-- Idempotent: ADD COLUMN IF NOT EXISTS handles VFF-01 having
-- already added reject_reason in the scaffolding migration.
-- ============================================================

ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS reject_reason TEXT,
  ADD COLUMN IF NOT EXISTS gate_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS gated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_viral_videos_reject_reason
  ON viral_videos(reject_reason)
  WHERE reject_reason IS NOT NULL;

-- Touch the analysis_status CHECK if needed; VFF-01 already includes 'rejected' and 'failed'.
```

## API Contracts

### `POST /api/cron/format-gate`
Auth: `Authorization: Bearer ${CRON_SECRET}`.
Request: empty.
Response (200):
```ts
{
  processed: number;
  passed: number;
  rejected: number;
  failed: number;
  by_reason: Record<string, number>;
  duration_ms: number;
}
```
Errors: 401, 500.

### `GET /api/admin/formats/rejected`
Auth: admin.
Query (Zod):
```ts
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(40),
  reason: z.string().min(1).max(40).optional(),
  platform: z.enum(['tiktok', 'instagram', 'youtube']).optional(),
});
```
Response (200):
```ts
{
  videos: Array<{
    id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    source_url: string;
    creator_handle: string | null;
    thumbnail_storage_url: string | null;
    thumbnail_source_url: string | null;
    views_count: number | null;
    duration_seconds: number | null;
    reject_reason: string;
    gate_metadata: Record<string, unknown>;
    posted_at: string | null;
    created_at: string;
  }>;
  total: number;
  page: number;
  page_size: number;
}
```
Errors: 400, 401, 403, 500.

### `POST /api/admin/formats/rejected/[id]/restore`
Auth: admin.
Request: empty.
Response (200):
```ts
{ id: string; analysis_status: 'pending' }
```
Errors: 401, 403, 404, 500.

## LLM Prompts

### Prompt: junk-filter-topic-gate
Model: `openai/gpt-5.4-mini` (fallback `anthropic/claude-haiku-4`).
Temperature: 0.0.
Max tokens: 200.

System:
```
You are a binary content gate for a short-form video discovery pipeline. Decide two things: is this a real short-form video with narrative structure, and is the topic related to ANY of the provided seed terms. Output strict JSON. Sentence case in any free text. No em dashes, no en dashes.
```

User template:
```
Caption: {caption}
Platform: {platform}
Duration: {duration_seconds}s
Brand seeds (any match counts): {seed_terms_csv}
Thumbnail URL: {thumbnail_url}

Return JSON:
{
  "is_short_form_video": true | false,
  "is_on_brand": true | false,
  "reason": "single short sentence explaining the decision"
}
```

Output schema:
```ts
const GateSchema = z.object({
  is_short_form_video: z.boolean(),
  is_on_brand: z.boolean(),
  reason: z.string().min(1).max(200),
});
```

Banned topics:
- Adult / NSFW content (gate must reject as `not_short_form` with reason mentioning policy).
- Graphic violence (same).
- Pure music compilations with no narrative (`not_short_form`).
- Non-English content longer than 30s where caption is not English (`not_short_form` — v1 English-only).

## UI Components

### `app/admin/formats/rejected/page.tsx`
Purpose: paginated grid of rejected videos with restore action.
Server component fetches first page; client island for pagination + restore.

Layout:
- `<PageHeader title="Rejected videos" subtitle="What the gate dropped this week" />`
- Filter row: reason dropdown + platform dropdown (sticky).
- Grid: 4 columns desktop (8-col layout would crowd 9:16 cards); each cell renders a slim card.

Each card:
- 9:16 thumbnail (with platform-tinted fallback per VFF-08 D-03).
- Reason badge top-left ("Low views", "Too long", "Off topic" etc., sentence case).
- Footer row: creator handle, views, "Restore" button (ghost).

Copy:
- H1: "Rejected videos"
- Subtitle: "What the gate dropped this week"
- Empty state: "Nothing rejected yet. The gate has not run."
- Restore confirm toast: "Restored. Will re-enter the gate on the next pass."
- Reason labels (slug → label):
  - `low_views` → "Low views"
  - `too_long` → "Too long"
  - `too_short` → "Too short"
  - `low_engagement` → "Low engagement"
  - `paid_ad` → "Paid ad"
  - `reposted` → "Reposted"
  - `not_short_form` → "Not short-form"
  - `off_topic` → "Off topic"

States: loading skeleton (12 card placeholders), empty, error, restoring (button spinner).

Tokens: `bg-background` page, `bg-surface` cards, accent pill for reason badge.

### `components/formats/reject-card.tsx`
Slim card variant of the eventual VFF-08 card. Props:
```ts
type Props = {
  video: {
    id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    thumbnail_storage_url: string | null;
    creator_handle: string | null;
    views_count: number | null;
    reject_reason: string;
  };
  onRestore: (id: string) => Promise<void>;
};
```

## File Map

Create:
- `supabase/migrations/275_viral_videos_reject_columns.sql`
- `lib/analytics/junk-filter.ts`
- `lib/analytics/junk-filter.test.ts`
- `lib/analytics/reject-reasons.ts` (enum + slug→label map for UI)
- `app/api/cron/format-gate/route.ts`
- `app/api/admin/formats/rejected/route.ts` (GET)
- `app/api/admin/formats/rejected/[id]/restore/route.ts` (POST)
- `app/admin/formats/rejected/page.tsx`
- `components/formats/reject-card.tsx`
- `tasks/ralph/vff-04-junk-filter/progress.txt`

Modify:
- `lib/supabase/types.ts` (regenerate)
- `lib/analytics/types.ts` (export `RejectReason` union)
- `vercel.json` (register `format-gate` cron `*/5 * * * *`)

## Env Vars

None new. Reuses `OPENROUTER_API_KEY`, `CRON_SECRET`.

## Edge Cases

- **Heuristic field missing.** Treat as "unknown not disqualifying": skip that specific check, continue to next. Never silently let through a video with all fields null; if `views`, `duration_seconds`, and engagement are all null, reject as `metadata_incomplete`.
- **Caption empty.** LLM gate runs with empty caption; thumbnail + duration still inform `is_short_form_video`. If both caption AND thumbnail are missing, reject heuristically as `metadata_incomplete`.
- **LLM returns malformed JSON.** Retry once; on second failure, leave row `'pending'`, increment `gate_metadata.llm_failures` counter; after 3 cumulative failures, mark `'failed'` with `reject_reason = 'gate_error'`.
- **OpenRouter timeout.** 30s timeout; failure path same as malformed JSON.
- **Engagement rate calculation with views = 0.** Use `max(views, 1)` guard; row almost certainly fails `low_views` first anyway.
- **Restore called on a non-rejected video.** Return 404 (idempotency: restoring a `pending` video has no effect; if `'analyzed'`, return 409).
- **Pagination query with reason filter.** Use the partial index on `reject_reason`; tested in T07.

## Test Plan

Unit:
- `lib/analytics/junk-filter.test.ts`:
  - Each heuristic triggers its expected reason.
  - All-null metadata → `metadata_incomplete`.
  - Heuristic pass leads to LLM call (LLM mocked).
  - LLM rejects on `is_short_form_video: false` → `not_short_form`.
  - LLM rejects on `is_on_brand: false` → `off_topic`.
  - LLM malformed JSON path increments failure counter and leaves status pending until 3rd failure.

Integration:
- Apply migration 275 on staging; column exists.
- POST cron `/api/cron/format-gate` with 5 seeded `'pending'` videos; assert metrics in response and rows transitioned.

E2E (Playwright): none v1.

Manual QA:
- Visit `/admin/formats/rejected` as admin, see grid.
- Filter by reason `low_views`; only those show.
- Click "Restore" on one; toast appears; row disappears from list; status flipped in DB.

## Architecture Wiring

- Helper `gateVideo` is pure (no DB writes); the cron route applies the verdict in a single SQL update.
- LLM call goes through `lib/ai/openrouter-rich.ts` exactly like brand context extraction (VFF-02), keeping JSON mode + Zod validation pattern consistent.
- Reject card UI is intentionally slim; VFF-08's full card is a different component because the rejected surface does not need format pills or hover overlays.

## Done When

- Migration 275 applied; `reject_reason`, `gate_metadata`, `gated_at` columns exist.
- Cron `format-gate` registered and drains pending queue.
- Rejection rate >= 55% across the first 200 videos after VFF-03 starts feeding.
- Admin spot-check of 20 random rejects: <=5% false-rejects.
- `/admin/formats/rejected` paginates and restores cleanly.
- `npx tsc --noEmit` clean, `npm run lint` clean.
- progress.txt fully `[x]`.
