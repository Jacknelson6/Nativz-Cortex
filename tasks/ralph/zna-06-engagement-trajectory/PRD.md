# PRD: ZNA · 06 · Per-post engagement trajectory

> Zernio Analytics · 06/06 · 2026-05-10

## Purpose & Value

ZNA-05 answers "is this post above average". ZNA-06 answers "is it still climbing or already cooling". For each post older than 48 h we track a small set of metric timepoints (1 h, 6 h, 24 h, 48 h, 72 h, then daily through day 30) and classify the trajectory into `still_climbing`, `peaked`, `declining`, `dead`. Each card gets a 7-day sparkline and a status pill. The strategist can decide whether to amplify (still climbing) or learn-and-move-on (peaked / dead). This is the last surface in the ZNA series and closes the analytics loop.

## Problem

A 1.7x-average post today could either be still climbing (boost it, repurpose it) or already past peak (do not pour gas on a cooling fire). Without timepoint data the strategist is guessing. We need a deterministic sampling cadence per post, a classifier based on last-24 h vs prior-24 h growth, and a low-cost sparkline render on every card. We also need to bound storage growth: 30-day retention on per-post timepoints, then downsample into ZNA-01 daily snapshots.

## Primary User

Strategist deciding whether to repurpose / boost / archive a post. Editor learning the shape of "winning" at 7 d. Client glancing at portal.

## SMART Goals

- Every post ≥ 48 h old has a trajectory sparkline and a status pill in the grid.
- Trajectory data updates every 6 h for posts younger than 14 days; daily for posts 14-30 days; rows older than 30 days are deleted.
- Status classifier ≥ 85 % accurate by weekly strategist spot check.
- Sparkline renders at card scale (≤ 60 px wide) without overflowing the 9:16 overlay.
- Cron sampling completes in p95 ≤ 4 min for all in-flight posts (under 1 000 posts).

## User Stories

- **US-01** — As a strategist, every card on the ZNA-04 grid shows a tiny 7-day sparkline below the headline metric.
- **US-02** — As a strategist, each card has a status pill: `still_climbing` (green arrow), `peaked` (neutral dash), `declining` (yellow arrow down), `dead` (grey square).
- **US-03** — As a strategist, I can filter the grid by status (e.g. "show me still-climbing posts").
- **US-04** — As a system, I track view counts at 1 h, 6 h, 24 h, 48 h, 72 h, then daily for 30 days.
- **US-05** — As a client viewer, I see the sparkline and pill on the portal, read only.
- **US-06** — As a system, posts younger than 48 h render the same `Too fresh` indicator used in ZNA-05 (no trajectory yet).

## In Scope

- Migration `287_post_metric_timepoints.sql` creating `post_metric_timepoints` table + RLS + retention helper function.
- Sampling cron `app/api/cron/post-timepoints/route.ts` registered in `vercel.json` every 30 min, with internal scheduling logic that captures only posts whose next-due-tick has arrived.
- `lib/analytics/trajectory.ts` exporting `classifyTrajectory(timepoints)` (pure) and `nextDueTick(post, lastTick)`.
- `lib/analytics/trajectory-sampler.ts` for the cron body: enumerates eligible posts, fetches latest metrics via Zernio adapter (ZNA-01), writes timepoint rows, classifies, updates `post_metric_trajectories` cache.
- Trajectory cache table `post_metric_trajectories` (one row per post; latest sparkline + classification snapshot).
- UI:
  - `components/analytics/post-trajectory-sparkline.tsx`
  - `components/analytics/post-trajectory-pill.tsx`
  - Filter chips for status in `post-grid-filter-bar.tsx`.
- Posts route extension to include trajectory block on each card.
- Storage retention job: delete `post_metric_timepoints` rows older than 30 days at the end of each cron run.

## Out of Scope

- Real-time push updates (poll-on-focus is fine; v1 reads the cache).
- Per-status automation (e.g. auto-boost spend on still-climbing); future automation layer.
- Trajectory for engagement rate; views only v1.
- Workflow DevKit per-post (D-01 decides daily fan-out cron for v1).
- TikTok watch-time trajectory (Zernio roadblock; CONTEXT.md).

## Resolved Decisions

- **D-01** — Workflow DevKit per post vs daily fan-out cron? **→ Fan-out cron every 30 min.** Rationale: simpler, observable, sufficient for v1; Workflow DevKit if and only if reliability becomes the bottleneck.
- **D-02** — Sampling cadence schedule? **→ 1 h, 6 h, 24 h, 48 h, 72 h, then daily for 30 days.** Rationale: matches the short-form PRD intent; covers the inflection points strategists care about.
- **D-03** — Cron cadence? **→ Every 30 min via `*/30 * * * *`.** Rationale: 30 min is the smallest granularity that respects the 1 h first-sample target without thrashing Zernio.
- **D-04** — Cache table or compute on read? **→ Cache table `post_metric_trajectories` (one row per post).** Rationale: cards render this on every grid load; computing per request would N+1 the response.
- **D-05** — Status classifier algorithm? **→ Deterministic heuristic based on last-24 h views vs prior-24 h views ratio (`r24`) and last-72 h vs prior-72 h ratio (`r72`).** Rationale: pure function, no LLM, testable, predictable; thresholds in D-06.
- **D-06** — Classifier thresholds? **→ `still_climbing` when `r24 >= 1.10`; `peaked` when `0.85 <= r24 < 1.10` AND `age_days <= 7`; `declining` when `r24 < 0.85` OR (`age_days > 7` AND `0.85 <= r24 < 1.10`); `dead` when `r24 < 0.20` AND `age_days >= 14`.** Rationale: 10 % week-over-week growth is the "still climbing" threshold (consistent with ZNA-02 7d rolling); 15 % decline is "declining"; "dead" requires both extreme decline and age.
- **D-07** — Sparkline window? **→ 7 days of timepoints.** Rationale: matches the strategist mental model and renders at card scale.
- **D-08** — Sparkline color? **→ Trajectory-aware: still_climbing emerald, peaked muted, declining amber, dead grey.** Rationale: redundant signal with the pill is fine here; reinforces at a glance.
- **D-09** — Status pill copy? **→ "Still climbing" / "Peaked" / "Declining" / "Dead".** Rationale: sentence-case in product UI; "Dead" is harsh but accurate and Jack approved blunt internal copy in `feedback_drops_vs_posts.md` (note: this PRD's surface is admin AND portal, so we soften only on portal: portal sees "Past peak" instead of "Dead").
- **D-10** — Portal copy for "dead"? **→ "Past peak".** Rationale: client-facing softening; matches the drops-vs-posts memory.
- **D-11** — Retention? **→ Delete timepoints older than 30 days at end of each cron run.** Rationale: bounded storage; older history collapses into ZNA-01 daily snapshots.
- **D-12** — Filter chip semantics? **→ Single-select status chip row (or "All"); multi-select would clutter a card-dense surface.** Rationale: keeps the bar light.
- **D-13** — How are posts younger than 48 h handled? **→ Match ZNA-05 `too_fresh` rendering: no sparkline, single muted dot pill "Too fresh".** Rationale: shared semantics with ZNA-05; do not classify content that is still climbing fast.
- **D-14** — Zernio API rate limit? **→ Adapter (`lib/analytics/zernio-adapter.ts` from ZNA-01) batches per-client; sampler enforces global concurrency cap 5; backoff on 429 with one retry.** Rationale: respects the Zernio rate guidance.
- **D-15** — Where is `next_tick_at` computed? **→ Derived per row from `published_at + cadence_offset`; persisted on the timepoint row for observability but always recomputed.** Rationale: idempotency; if a tick misses we can detect drift.
- **D-16** — Cron auth? **→ Standard `Authorization: Bearer ${CRON_SECRET}`.** Rationale: same as every other cron.
- **D-17** — Cron telemetry? **→ Wrap in `withCronTelemetry`.** Rationale: every existing cron does this.

## Data Model

### Migration `287_post_metric_timepoints.sql`

```sql
-- ============================================================
-- ZNA-06: Per-post metric timepoints + trajectory cache.
-- Sampled every 30 min by app/api/cron/post-timepoints.
-- Retention: 30 days on timepoints; cache updates idempotently.
-- ============================================================

CREATE TABLE IF NOT EXISTS post_metric_timepoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_metric_id UUID NOT NULL REFERENCES post_metrics(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','facebook','youtube')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  age_hours INTEGER NOT NULL,           -- snapshot of (now - published_at) at sample time
  views_count INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  saves_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('zernio','scrape','apify')),
  CONSTRAINT post_metric_timepoints_unique_per_capture UNIQUE (post_metric_id, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_post_metric_timepoints_post_time
  ON post_metric_timepoints(post_metric_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_metric_timepoints_retention
  ON post_metric_timepoints(captured_at);

ALTER TABLE post_metric_timepoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_metric_timepoints_admin_all ON post_metric_timepoints
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('admin','super_admin')
  ));

CREATE POLICY post_metric_timepoints_viewer_read ON post_metric_timepoints
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'viewer'
      AND users.organization_id = post_metric_timepoints.organization_id
  ));

-- Trajectory cache: one row per post, snapshot of latest classification + sparkline.
CREATE TABLE IF NOT EXISTS post_metric_trajectories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_metric_id UUID NOT NULL REFERENCES post_metrics(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('still_climbing','peaked','declining','dead','too_fresh')),
  r24 NUMERIC(8,3),                     -- last-24h / prior-24h views ratio
  r72 NUMERIC(8,3),                     -- last-72h / prior-72h views ratio
  age_hours INTEGER NOT NULL,
  sparkline_views INTEGER[] NOT NULL DEFAULT '{}',   -- last 7 daily totals (or fewer if young)
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT post_metric_trajectories_unique UNIQUE (post_metric_id)
);

CREATE INDEX IF NOT EXISTS idx_post_metric_trajectories_status
  ON post_metric_trajectories(client_id, status);

ALTER TABLE post_metric_trajectories ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_metric_trajectories_admin_all ON post_metric_trajectories
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('admin','super_admin')
  ));

CREATE POLICY post_metric_trajectories_viewer_read ON post_metric_trajectories
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'viewer'
      AND users.organization_id = post_metric_trajectories.organization_id
  ));

-- Retention helper, called at end of each cron run.
CREATE OR REPLACE FUNCTION delete_expired_post_timepoints()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM post_metric_timepoints
   WHERE captured_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
```

## API Contracts

### `GET /api/cron/post-timepoints`

Auth: `Authorization: Bearer ${CRON_SECRET}`.

Behavior:

1. Enumerate eligible posts: `post_metrics` rows where `published_at >= now() - 30 days` AND (no row in `post_metric_trajectories` OR `computed_at < now() - cadence_for_age(age)`).
2. For each eligible post (concurrency cap 5):
   - Determine `next_due_tick(published_at, last_captured_at)`; skip if `next_due_tick > now()`.
   - Fetch latest metrics via `fetchZernioPostMetrics` (ZNA-01); on 429 backoff once with 1 s sleep.
   - INSERT `post_metric_timepoints` row.
   - Recompute trajectory: load last 14 days of timepoints for this post (and synthesise daily totals from raw timepoints), classify, UPSERT `post_metric_trajectories`.
3. Call `delete_expired_post_timepoints()`; log row count.
4. Return summary.

Response (200):

```ts
{
  scanned: number;
  sampled: number;
  classified: number;
  expired_rows_deleted: number;
  duration_ms: number;
  failures: Array<{ post_metric_id: string; reason: string }>;
}
```

Wrap with `withCronTelemetry`. `export const maxDuration = 300`.

Vercel cron entry: `*/30 * * * *`.

### Posts route extension (admin + portal)

The ZNA-04/05 posts route extends each `PostCard` further with a `trajectory` block:

```ts
type Trajectory = {
  status: 'still_climbing' | 'peaked' | 'declining' | 'dead' | 'too_fresh';
  status_label: string;                  // "Still climbing" / "Peaked" / "Declining" / "Dead" (admin), "Past peak" on portal for 'dead'
  r24: number | null;
  r72: number | null;
  age_hours: number;
  sparkline_views: number[];             // up to 7 ints
  computed_at: string;
};
```

New query param:

```ts
const QueryExtension = z.object({
  status: z
    .enum(['still_climbing','peaked','declining','dead','too_fresh','any'])
    .default('any'),
});
```

Server-side join on `post_metric_trajectories`; when no row exists for a post < 48 h old, synthesise `too_fresh` inline.

Portal route: identical, but server replaces `status_label` for `dead` with `"Past peak"`.

## LLM Prompts

None.

## TypeScript types + module shape

### `lib/analytics/trajectory.ts`

```ts
export type TrajectoryStatus =
  | 'still_climbing'
  | 'peaked'
  | 'declining'
  | 'dead'
  | 'too_fresh';

export interface ClassifyInput {
  publishedAt: string;             // ISO
  timepoints: Array<{ captured_at: string; views_count: number }>;
  now?: Date;
}

export interface ClassifyOutput {
  status: TrajectoryStatus;
  r24: number | null;
  r72: number | null;
  age_hours: number;
  sparkline_views: number[];
}

export function classifyTrajectory(input: ClassifyInput): ClassifyOutput;

export const SAMPLE_OFFSETS_HOURS: number[] = [1, 6, 24, 48, 72];
export const DAILY_THROUGH_DAYS = 30;

export function nextDueTick(args: {
  publishedAt: string;
  lastCapturedAt: string | null;
  now?: Date;
}): Date;
```

`classifyTrajectory` logic:

1. Compute `age_hours = (now - publishedAt) / 1h`. If `age_hours < 48` → `too_fresh` (sparkline whatever data exists).
2. Bucket timepoints into 1-day windows ending now, take last 7 buckets, sum `views_count` deltas per bucket → `sparkline_views`.
3. Compute `last_24h_views = sum of views in last 24h window` minus `views at start of last 24h window` (delta).
4. `prior_24h_views = sum delta in 24-48h window`.
5. `r24 = last_24h_views / prior_24h_views`; guard zero division (`prior_24h_views == 0 && last_24h_views > 0` → `r24 = Infinity treated as still_climbing`; both zero → `r24 = 0`).
6. Compute `r72` analogously over 72 h windows.
7. Apply thresholds from D-06; return.

`nextDueTick`:

- Walk `SAMPLE_OFFSETS_HOURS`; find smallest offset strictly greater than current age; if all offsets passed, snap to next 24 h tick (daily mode) up to day 30.
- If `lastCapturedAt` is null, return `publishedAt + 1h`.

### `lib/analytics/trajectory-sampler.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SamplerArgs {
  supabase: SupabaseClient;
  now?: Date;
  concurrencyCap?: number;          // default 5
}

export interface SamplerResult {
  scanned: number;
  sampled: number;
  classified: number;
  expiredDeleted: number;
  failures: Array<{ post_metric_id: string; reason: string }>;
  durationMs: number;
}

export async function runTrajectorySampler(args: SamplerArgs): Promise<SamplerResult>;
```

Reuses `fetchZernioPostMetrics` from `lib/analytics/zernio-adapter.ts` (ZNA-01); on Zernio failure persists nothing for that post and pushes to `failures`. Calls `delete_expired_post_timepoints` RPC at end.

### `lib/analytics/types.ts` extension

Add `TrajectoryStatus`, `Trajectory`, `Timepoint` exports.

## UI Components

### `components/analytics/post-trajectory-sparkline.tsx`

Top of file: `'use client'`.

Purpose: 7-bucket sparkline rendered with Recharts `LineChart` in a tiny container.

Props:

```ts
type Props = {
  views: number[];                  // up to 7 ints
  status: TrajectoryStatus;
  className?: string;
};
```

Layout:

- Container: `w-14 h-5`.
- Recharts `<ResponsiveContainer>` → `<LineChart data={...}>` → single `<Line>` `dot={false}`, `strokeWidth={1.5}`.
- Stroke per status:
  - `still_climbing`: `text-emerald-400`
  - `peaked`: `text-muted-foreground`
  - `declining`: `text-amber-400`
  - `dead`: `text-zinc-500`
  - `too_fresh`: render null (no sparkline).
- No axes, no labels, no tooltip.

States: `<3` data points → flat horizontal line at the mean; `too_fresh` → null render.

### `components/analytics/post-trajectory-pill.tsx`

Top of file: `'use client'`.

Purpose: status pill rendered in the card overlay row.

Props:

```ts
type Props = {
  status: TrajectoryStatus;
  label: string;                    // server-supplied (handles dead->Past peak swap)
  r24: number | null;
};
```

Layout: inline-flex pill, `h-5 px-2 rounded-full text-[11px]`, icon + label. Icon per status:

- `still_climbing`: `ArrowUpRight` lucide, `text-emerald-400`, `bg-emerald-500/15`.
- `peaked`: `Minus` lucide, `text-muted-foreground`, `bg-surface-2`.
- `declining`: `ArrowDownRight` lucide, `text-amber-400`, `bg-amber-500/15`.
- `dead`: `Square` lucide, `text-zinc-500`, `bg-zinc-500/15`.
- `too_fresh`: `Clock` lucide, `text-amber-300/60`, `bg-amber-200/10`.

Tooltip:

- `still_climbing`: "Still climbing ({r24}x last 24h vs prior 24h)."
- `peaked`: "Peaked ({r24}x last 24h)."
- `declining`: "Declining ({r24}x last 24h)."
- `dead` admin: "Dead ({r24}x last 24h)."
- `dead` portal: "Past peak ({r24}x last 24h)."
- `too_fresh`: "Posts younger than 48 h are still climbing."

Buttons never wrap (`<Button>` primitive); pill uses `span` not button, but copy stays short.

### `post-card.tsx` modification

Add a footer row inside the overlay, below the existing posted-at + headline metric:

```tsx
<div className="flex items-center justify-between gap-2 pt-1">
  <PostTrajectorySparkline views={post.trajectory.sparkline_views} status={post.trajectory.status} />
  <PostTrajectoryPill status={post.trajectory.status} label={post.trajectory.status_label} r24={post.trajectory.r24} />
</div>
```

### `post-grid-filter-bar.tsx` modification

Add a single-select status chip row left of the existing platform chips:

- "All", "Still climbing", "Peaked", "Declining", "Dead" (admin) / "Past peak" (portal).

Selected chip applies `status=` to the query string.

Empty state when filter returns no rows: "No posts in this status in the last {since_days} days."

## File Map

Create:

- `supabase/migrations/287_post_metric_timepoints.sql`
- `lib/analytics/trajectory.ts`
- `lib/analytics/trajectory.test.ts`
- `lib/analytics/trajectory-sampler.ts`
- `lib/analytics/trajectory-sampler.test.ts`
- `app/api/cron/post-timepoints/route.ts`
- `components/analytics/post-trajectory-sparkline.tsx`
- `components/analytics/post-trajectory-pill.tsx`
- `tasks/ralph/zna-06-engagement-trajectory/progress.txt`

Modify:

- `vercel.json` (add cron entry `*/30 * * * *` for `/api/cron/post-timepoints`).
- `app/api/analytics/zernio/posts/route.ts` (extend with `trajectory` block + `status` filter; admin labels).
- `app/api/portal/analytics/zernio/posts/route.ts` (extend with `trajectory` block + `status` filter; portal "Past peak" label).
- `lib/analytics/posts-query.ts` (join `post_metric_trajectories`, accept `status` filter).
- `components/analytics/post-card.tsx` (mount sparkline + pill).
- `components/analytics/post-grid-filter-bar.tsx` (add status chip row).
- `lib/supabase/types.ts` (regenerated).

## Env Vars

None new. Reuses `CRON_SECRET`, `ZERNIO_*`, `SUPABASE_SERVICE_ROLE_KEY`.

## Edge Cases

- **Post under 48 h old.** Classifier returns `too_fresh`; sampler still runs for early ticks; pill renders `Too fresh`; sparkline omitted.
- **Post over 30 days old.** Sampler stops scheduling new ticks; trajectory cache stays at last value; retention deletes timepoints; sparkline still renders from cache snapshot.
- **Zernio returns 429.** Single retry with 1 s backoff; on second failure, push to `failures`; no timepoint row; trajectory cache untouched.
- **Zernio returns lower `views_count` than previously stored (data correction).** Allowed; we capture as-is; `last_24h_views` delta may go negative; classifier guard treats negative as 0.
- **All zero views.** `r24 = 0/0`; classifier returns `r24 = 0` → `declining` if `age_hours > 48` and `< 48h` → `too_fresh`. Visually amber.
- **Post deleted while sampler is in flight.** ON DELETE CASCADE on timepoints and trajectory; insert fails with FK violation; swallowed in `failures`.
- **Concurrent sampler runs (manual + scheduled).** UPSERT on `post_metric_trajectories.post_metric_id` is idempotent; unique constraint on `(post_metric_id, captured_at)` deduplicates timepoints.
- **Bucketing across UTC midnight boundary.** Sparkline buckets are rolling 24 h windows ending at "now", not calendar days; consistent across timezones.
- **Filter `status=too_fresh`.** Allowed; grid filters to under-48 h posts.
- **Portal sees `dead` posts.** Label swapped server-side to "Past peak" before send; tooltip copy mirrors.
- **Retention deletes the last timepoint of a 31-day post.** Trajectory cache row stays; sparkline already snapshotted; older data is in ZNA-01 daily snapshots.
- **Status pill is too dense at small viewport.** Pill stays single-line (`whitespace-nowrap` on the underlying span); sparkline + pill row uses `min-w-0` + truncation if needed.

## Test Plan

Unit:

- `lib/analytics/trajectory.test.ts`:
  - Threshold matrix: `r24=1.10`, `r24=1.09`, `r24=0.85`, `r24=0.84`, `r24=0.19` at various `age_days`.
  - `too_fresh` under 48 h regardless of `r24`.
  - `dead` requires `r24 < 0.20 AND age_days >= 14`.
  - `peaked` requires `0.85 <= r24 < 1.10 AND age_days <= 7`.
  - `declining` covers age > 7 + flat case.
  - `nextDueTick` returns `+1h` for never-sampled post, then 6 h / 24 h / 48 h / 72 h / daily.
  - Sparkline bucketing of arbitrary timepoint arrays.

- `lib/analytics/trajectory-sampler.test.ts`:
  - Concurrency cap respected with a mock Zernio adapter.
  - 429 triggers single retry.
  - FK-cascade race produces `failures` row, not throw.
  - `delete_expired_post_timepoints` invocation captured.

Integration:

- Cron route smoke: seed 3 fixtures (one < 48 h, one 5 d, one 25 d); run cron; assert sampled / classified counts.
- Posts route returns trajectory block on every card.

E2E (Playwright):

- `/admin/analytics/zernio?clientId=<nike>`: sparkline + pill render on every card; status filter chip narrows the grid; portal "Past peak" label visible for `dead` posts.

Manual QA:

- Walk Nike fixtures through 7 days; verify classifications match the strategist's eye.

## Architecture Wiring

- Sampling cron runs every 30 min; tied to existing `withCronTelemetry`; Bearer `CRON_SECRET`.
- Reuses Zernio adapter from ZNA-01 (`lib/analytics/zernio-adapter.ts`); honors source routing.
- Reads from `post_metrics` (ZNA-04 extended).
- Writes `post_metric_timepoints` and `post_metric_trajectories` (new); RLS mirrors every portal-readable table.
- Renders inside existing ZNA-04 `post-card.tsx`; uses ZNA-05's `too_fresh` semantics for consistency.
- Posts route extension keeps API surface stable; same response shape with one new block.
- ZNA-06 closes the ZNA series; downstream PRDs (none in this batch) inherit the full per-post picture.

## Done When

- Migration 287 applied; `post_metric_timepoints`, `post_metric_trajectories`, and `delete_expired_post_timepoints()` exist with RLS.
- Cron `post-timepoints` registered in `vercel.json` and runs every 30 min on staging.
- After 24 h of cron runs against staging fixtures, ≥ 90 posts have a `post_metric_trajectories` row.
- `classifyTrajectory` pure function passes every threshold case in unit tests.
- Sparkline and status pill render on every card in `/admin/analytics/zernio` and `/portal/analytics`.
- Status filter chip narrows the grid.
- Portal swaps `Dead` for `Past peak`.
- Posts older than 30 days do not accumulate new timepoint rows; retention helper deletes expired rows on each run.
- `npx tsc --noEmit` clean; `npm run lint` clean.
- progress.txt fully `[x]`.
