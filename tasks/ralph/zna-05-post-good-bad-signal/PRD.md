# PRD: ZNA · 05 · Per-post good/bad signal

> Zernio Analytics · 05/06 · 2026-05-10

## Purpose & Value

For each post in the ZNA-04 grid, attach a one-glance signal: did this post beat the brand's own rolling 30-day baseline, hit average, or underperform? The signal is computed against the brand's own data per platform, so it is apples-to-apples. The badge lets a strategist eye-scan a grid of 90 posts and locate the wins in seconds. Together with ZNA-06 trajectory it tells the full story: "this post is above average AND still climbing."

## Problem

A 8 k-view post is context-free. For a brand averaging 1 k views it is a hit; for a brand averaging 50 k it is a miss. The ZNA-04 grid shows the headline metric but offers no relative reading, so strategists have to do the mental math per card. We want a deterministic, defensible, transparent signal computed against the brand's own 30-day baseline, cached for 24 h, and rendered as a small colored dot on every card with a hover tooltip showing the math.

## Primary User

Strategist scanning the post grid. Client noticing wins on the portal.

## SMART Goals

- Every post older than 48 h has a signal of one of `above_avg`, `avg`, `below_avg`, computed from the brand-and-platform rolling 30-day mean.
- Posts younger than 48 h get `too_fresh` (no false reads on climbing content).
- Thresholds: `above_avg` when `ratio >= 1.30`; `below_avg` when `ratio <= 0.70`; else `avg`.
- Signals cache to `post_performance_signals` and refresh when older than 24 h; never recompute on every grid render.
- Engagement-rate denominator is views (per `feedback_analytics_accuracy_pass_2026_04_23.md`).
- Hover tooltip discloses the math verbatim: "8.4k views (1.7x your TikTok 30-day avg of 4.9k)."

## User Stories

- **US-01** — As a strategist, every card on the grid has a small dot in the top-right corner colored green / neutral / red / muted.
- **US-02** — As a strategist, hovering the dot shows the underlying ratio and baseline.
- **US-03** — As a strategist, I can flip a filter chip "Above average only" and the grid filters to green dots.
- **US-04** — As a strategist, a post within its first 48 h post-publish shows the muted "Too fresh" indicator with a tooltip "Posts younger than 48 h are still climbing."
- **US-05** — As a client viewer, I see the same dot on portal, with the same tooltip math.

## In Scope

- Migration `286_post_performance_signals.sql` creating `post_performance_signals` table + RLS.
- `lib/analytics/post-signal.ts` exporting `classifySignal({ views, baselineMean })` (pure function) and `computeBrandPlatformBaseline({ supabase, clientId, platform })` (reads `post_metrics`).
- Compute + cache loop: lazy-on-grid-load, persists to `post_performance_signals`; refresh when `computed_at` is older than 24 h.
- API: integrate signals into the existing ZNA-04 posts route (no new public endpoint).
- UI:
  - `components/analytics/post-signal-dot.tsx` (small colored dot + tooltip).
  - Filter chip "Above average only" wired into `post-grid-filter-bar.tsx`.

## Out of Scope

- Industry-wide benchmarking (defer).
- Per-format baselines (deferred to a future PRD that wires VFF-06 format taxonomy into signals).
- Signal on engagement rate (views only v1; ER shown in hover tooltip but not classified).
- Cron-based bulk recompute (v1 is lazy + cached; bulk job is a stretch).
- LLM scoring (deterministic only).

## Resolved Decisions

- **D-01** — Threshold 1.30 / 0.70? **→ Yes.** Rationale: a 30 % cushion above/below average is the smallest band that consistently separates hits from noise across brands; wider would surface too few "above"; tighter would label every middling post as either green or red.
- **D-02** — Baseline window? **→ Rolling 30 days.** Rationale: 90 d feels stale; 7 d is too noisy; 30 d catches trend shifts and stabilises after the brand's first month.
- **D-03** — Baseline source? **→ `post_metrics` for the brand × platform over the last 30 calendar days, mean of `views_count` excluding the post being classified.** Rationale: excluding the target post avoids the post moving its own baseline; 30 d aligns with D-02.
- **D-04** — When baseline is sparse (< 5 posts in window)? **→ Return `too_fresh` regardless of post age, and surface a one-time strategist hint in the grid empty-baseline state.** Rationale: 5 posts is the minimum for the mean to mean anything; below that we cannot honestly classify.
- **D-05** — When the post is younger than 48 h? **→ Return `too_fresh`; recompute on the next 24 h tick once it crosses 48 h.** Rationale: posts climb fast in the first 48 h; classifying them green/red would mislead. Aligns with `lib/analytics/trajectory.ts` cadence in ZNA-06.
- **D-06** — Caching strategy? **→ Lazy on grid load, persist to `post_performance_signals`, refresh when older than 24 h.** Rationale: spreads compute cost over user traffic; avoids a heavy bulk recompute cron; 24 h cache aligns with daily snapshot cadence from ZNA-01.
- **D-07** — Where does the badge render? **→ Inside `post-card.tsx` from ZNA-04, top-right corner, h-3.5 w-3.5 rounded-full with a 1 px ring.** Rationale: visible at card scale; does not obstruct the thumbnail.
- **D-08** — Filter chip semantics? **→ "Above average only" toggles to filter signals === 'above_avg'.** Rationale: matches PRD US-03; below-average filter is for editorial review and not the primary use case.
- **D-09** — Recompute trigger on stale-cache? **→ On read; route writes new signal row asynchronously after responding (fire-and-forget within request).** Rationale: avoids blocking the grid response on a recompute pass.
- **D-10** — Storage: one row per post or upsert? **→ Upsert on `(post_metric_id)` unique constraint; column `computed_at` for staleness.** Rationale: one row per post is enough; we only care about the latest classification.
- **D-11** — Portal visibility? **→ Viewer reads signals via the same posts route which now joins `post_performance_signals` and returns the classification inline.** Rationale: no new portal endpoint.
- **D-12** — RLS? **→ Admin all; viewer SELECT scoped via join through `post_metrics → clients.organization_id`.** Rationale: matches every other portal-readable table.
- **D-13** — Color tokens? **→ above_avg `text-emerald-400`; avg `text-muted-foreground`; below_avg `text-red-400`; too_fresh `text-amber-300/60` (muted).** Rationale: matches the carve-out where green / red are allowed on the sentiment bar; emerald/red are the analytics duals.

## Data Model

### Migration `286_post_performance_signals.sql`

```sql
-- ============================================================
-- ZNA-05: Per-post good/bad signal vs brand-and-platform baseline.
-- One row per post_metric. Computed lazily on grid load; refresh 24h.
-- ============================================================

CREATE TABLE IF NOT EXISTS post_performance_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_metric_id UUID NOT NULL REFERENCES post_metrics(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','facebook','youtube')),
  signal TEXT NOT NULL CHECK (signal IN ('above_avg','avg','below_avg','too_fresh')),
  ratio NUMERIC(8,3),                 -- views / baseline_mean; null when too_fresh / sparse baseline
  views_count INTEGER NOT NULL,
  baseline_mean NUMERIC(12,2),        -- null when sparse baseline
  baseline_sample_size INTEGER NOT NULL,
  baseline_window_days INTEGER NOT NULL DEFAULT 30,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,                        -- 'sparse_baseline' | 'too_fresh' | null
  CONSTRAINT post_performance_signals_unique UNIQUE (post_metric_id)
);

CREATE INDEX IF NOT EXISTS idx_post_performance_signals_client_signal
  ON post_performance_signals(client_id, signal);
CREATE INDEX IF NOT EXISTS idx_post_performance_signals_stale
  ON post_performance_signals(computed_at);

ALTER TABLE post_performance_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_performance_signals_admin_all ON post_performance_signals
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

CREATE POLICY post_performance_signals_viewer_read ON post_performance_signals
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'viewer'
      AND users.organization_id = post_performance_signals.organization_id
  ));
```

## API Contracts

### `GET /api/analytics/zernio/posts` (extends ZNA-04)

Auth: admin.

No new query params. Response shape extends each `PostCard` with:

```ts
type PostCardWithSignal = PostCard & {
  signal: {
    classification: 'above_avg' | 'avg' | 'below_avg' | 'too_fresh';
    ratio: number | null;
    baseline_mean: number | null;
    baseline_sample_size: number;
    baseline_window_days: number;
    computed_at: string;
    reason: 'sparse_baseline' | 'too_fresh' | null;
  };
};
```

And a new optional query param:

```ts
const QueryExtension = z.object({
  signal: z.enum(['above_avg','avg','below_avg','too_fresh','any']).default('any'),
});
```

When `signal !== 'any'`, filter post rows to only those with a matching `post_performance_signals.signal`.

Behavior: after loading posts, for each post:

1. Look up the latest `post_performance_signals` row.
2. If missing OR `computed_at < now() - interval '24 hours'`, enqueue a recompute (fire-and-forget) AND use the stale row for response if any; if no stale row, compute synchronously for that post only.

### `GET /api/portal/analytics/zernio/posts` (extends ZNA-04 portal)

Same extension. Portal request also accepts `signal` query param.

## LLM Prompts

None.

## TypeScript types + module shape

### `lib/analytics/post-signal.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type Signal = 'above_avg' | 'avg' | 'below_avg' | 'too_fresh';

export interface ClassifyInput {
  views: number;
  baselineMean: number | null;
  baselineSampleSize: number;
  publishedAt: string;            // ISO
  now?: Date;                     // injectable for tests
}

export interface ClassifyResult {
  signal: Signal;
  ratio: number | null;
  reason: 'sparse_baseline' | 'too_fresh' | null;
}

export function classifySignal(input: ClassifyInput): ClassifyResult;

export const ABOVE_AVG_THRESHOLD = 1.30;
export const BELOW_AVG_THRESHOLD = 0.70;
export const TOO_FRESH_HOURS = 48;
export const SPARSE_BASELINE_MIN_POSTS = 5;
export const BASELINE_WINDOW_DAYS = 30;

export interface BaselineArgs {
  supabase: SupabaseClient;
  clientId: string;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube';
  excludePostMetricId?: string;
  now?: Date;
}

export interface Baseline {
  mean: number | null;
  sampleSize: number;
}

export async function computeBrandPlatformBaseline(args: BaselineArgs): Promise<Baseline>;
```

`classifySignal` logic:

1. If `hoursSince(publishedAt) < TOO_FRESH_HOURS` → `{ signal: 'too_fresh', ratio: null, reason: 'too_fresh' }`.
2. If `baselineSampleSize < SPARSE_BASELINE_MIN_POSTS` or `baselineMean == null` → `{ signal: 'too_fresh', ratio: null, reason: 'sparse_baseline' }`.
3. `ratio = views / baselineMean`.
4. If `ratio >= ABOVE_AVG_THRESHOLD` → `above_avg`. If `ratio <= BELOW_AVG_THRESHOLD` → `below_avg`. Else `avg`.
5. Round `ratio` to three decimals.

`computeBrandPlatformBaseline`:

- Reads `post_metrics` for `client_id = $clientId AND platform = $platform AND published_at >= now() - 30 days AND id <> $excludePostMetricId`.
- Returns `mean = avg(views_count)` and `sampleSize`. AI-fields null-safe: `views_count ?? 0`.

### `lib/analytics/post-signal-cache.ts`

```ts
export interface UpsertSignalArgs {
  supabase: SupabaseClient;
  postMetricId: string;
  clientId: string;
  organizationId: string;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube';
  viewsCount: number;
  baseline: Baseline;
  classification: ClassifyResult;
}

export async function upsertPostSignal(args: UpsertSignalArgs): Promise<void>;

export interface ReadSignalArgs {
  supabase: SupabaseClient;
  postMetricIds: string[];
}

export async function readPostSignals(args: ReadSignalArgs): Promise<Map<string, PostSignalRow>>;
```

Upsert uses `onConflict: 'post_metric_id'` with all fields refreshed.

### Posts route hook

In `app/api/analytics/zernio/posts/route.ts` (extended from ZNA-04):

1. Load post page via `loadPostsForGrid`.
2. `readPostSignals` for the loaded posts; build a `Map`.
3. For each post:
   - If signal exists and `computed_at >= now - 24h` → use it.
   - Else if signal exists and stale → use it AND enqueue recompute (async; not awaited).
   - Else (no signal) → compute synchronously for this single post, persist, attach.
4. Apply `signal=` filter if provided.
5. Return response shape with `signal` attached to each card.

The recompute enqueue uses `after(() => ...)` via Next 15 `unstable_after` if available, else `Promise.resolve().then(() => ...)`; failure is logged not propagated.

## UI Components

### `components/analytics/post-signal-dot.tsx`

Top of file: `'use client'`.

Purpose: small colored dot rendered absolutely-positioned inside the post card; tooltip on hover.

Props:

```ts
type Props = {
  signal: 'above_avg' | 'avg' | 'below_avg' | 'too_fresh';
  ratio: number | null;
  baselineMean: number | null;
  baselineSampleSize: number;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube';
  postViews: number;
  reason: 'sparse_baseline' | 'too_fresh' | null;
};
```

Layout:

- `absolute top-2 right-2` inside the card.
- `h-3.5 w-3.5 rounded-full ring-1 ring-black/40`.
- Color:
  - `above_avg`: `bg-emerald-400`
  - `avg`: `bg-muted-foreground/60`
  - `below_avg`: `bg-red-400`
  - `too_fresh`: `bg-amber-300/60`
- Hover: Radix tooltip with:
  - `above_avg`/`below_avg`/`avg`:  
    "{compactViews} views ({ratio}x your {platformLabel} 30-day avg of {compactBaseline})"
  - `too_fresh` with `reason='too_fresh'`:  
    "Posts younger than 48 h are still climbing."
  - `too_fresh` with `reason='sparse_baseline'`:  
    "Not enough recent posts to set a baseline ({sampleSize}/5)."

Copy formats:

- `platformLabel`: "TikTok", "Instagram", "YouTube", "Facebook".
- `compactViews` and `compactBaseline`: `Intl.NumberFormat('en-US', { notation: 'compact' })`.
- `ratio` rendered to one decimal with "x" suffix, e.g. "1.7x".

### `post-card.tsx` modification (ZNA-04)

Add the dot:

```tsx
<PostSignalDot
  signal={post.signal.classification}
  ratio={post.signal.ratio}
  baselineMean={post.signal.baseline_mean}
  baselineSampleSize={post.signal.baseline_sample_size}
  platform={post.platform}
  postViews={post.views_count}
  reason={post.signal.reason}
/>
```

### `post-grid-filter-bar.tsx` modification (ZNA-04)

Add a single Switch / Toggle: "Above average only" sentence case. When ON, query string `signal=above_avg` propagates and the grid filters server-side.

Copy:

- Label: "Above average only"
- Helper text when no above-average posts in window: "No above-average posts in the last {since_days} days."

## File Map

Create:

- `supabase/migrations/286_post_performance_signals.sql`
- `lib/analytics/post-signal.ts`
- `lib/analytics/post-signal.test.ts`
- `lib/analytics/post-signal-cache.ts`
- `components/analytics/post-signal-dot.tsx`
- `tasks/ralph/zna-05-post-good-bad-signal/progress.txt`

Modify:

- `app/api/analytics/zernio/posts/route.ts` (extend with signals).
- `app/api/portal/analytics/zernio/posts/route.ts` (extend with signals).
- `components/analytics/post-card.tsx` (mount `<PostSignalDot />`).
- `components/analytics/post-grid-filter-bar.tsx` (add "Above average only" toggle).
- `lib/analytics/posts-query.ts` (accept and pass through `signal` filter param).
- `lib/supabase/types.ts` (regenerated).

## Env Vars

None new.

## Edge Cases

- **Brand has fewer than 5 posts on this platform in window.** `sparse_baseline` reason; dot renders muted amber; tooltip discloses sample size.
- **Post is brand-new (under 48 h).** `too_fresh`; reason `too_fresh`; dot amber. Recompute on next read after the 48 h mark.
- **`views_count == 0` on the target post.** `ratio = 0`; classified `below_avg`; tooltip reads "0 views (0.0x your … avg of 4.9k)".
- **`baseline_mean == 0` (every post in window has 0 views; rare).** Treat as sparse; classification `too_fresh` with `sparse_baseline`.
- **Stale signal exists but baseline has shifted dramatically since.** Stale signal still rendered for the request; recompute is enqueued; the next page load reflects the new value.
- **Post deleted while recompute is in flight.** ON DELETE CASCADE on `post_performance_signals.post_metric_id`; the recompute INSERT will fail with FK violation; swallowed by `console.error` and not propagated.
- **Concurrent recomputes for same post.** UPSERT on `(post_metric_id)` makes it idempotent.
- **Portal viewer requests `signal=below_avg`.** Allowed; viewers can see their own brand's below-avg posts (transparency is fine).
- **Filter "Above average only" with no above-average posts.** Helper text "No above-average posts in the last {since_days} days." renders; grid stays empty.
- **Two posts published in same second.** Cursor pagination handles ordering; signals are per-post so no interaction.
- **Recompute hits a deleted client (cascade race).** Same FK swallow path.

## Test Plan

Unit:

- `lib/analytics/post-signal.test.ts`:
  - Threshold table-driven: `ratio = 1.30` → above; `ratio = 1.29` → avg; `ratio = 0.70` → below; `ratio = 0.71` → avg.
  - `hoursSince < 48` → `too_fresh` regardless of ratio.
  - Sparse baseline (sampleSize 4) → `too_fresh` with `sparse_baseline`.
  - `baselineMean = 0` → `too_fresh` with `sparse_baseline`.
  - `views = 0` → ratio 0 → `below_avg`.
  - Ratio rounding to three decimals.

Integration:

- API extension: post page loads; signals populated; stale signal triggers async recompute and a second load returns fresh `computed_at`.
- `signal=above_avg` query returns only above-avg posts.

E2E (Playwright):

- `/admin/analytics/zernio?clientId=<nike>`: every visible card has a dot; toggling "Above average only" filters the grid.
- Hover dot: tooltip displays the math.

Manual QA:

- Seed Nike fixture with 10 posts spanning 7 days, 5 above 1.3x avg and 3 below 0.7x avg.
- Verify dot colors match expectations; verify tooltip math.

## Architecture Wiring

- Reads from `post_metrics` (ZNA-04 extended).
- Persists to new `post_performance_signals` table; RLS mirrors every portal-readable table.
- Lazy recompute on grid load; uses `unstable_after` when available so the user does not pay the latency cost.
- ZNA-06 attaches its trajectory sparkline next to the dot; positioning reserved in `post-card.tsx`.
- No new cron; ZNA-01's daily snapshot job indirectly tightens the baseline as new `post_metrics` rows land.

## Done When

- Migration 286 applied; `post_performance_signals` exists with RLS.
- `lib/analytics/post-signal.ts` pure function tested across all thresholds.
- Posts API returns `signal` block on every card.
- `<PostSignalDot />` renders on every card in `/admin/analytics/zernio` and `/portal/analytics`.
- Hover tooltip discloses ratio + baseline; copy matches PRD verbatim.
- "Above average only" toggle filters the grid.
- Posts younger than 48 h render `too_fresh` amber dot.
- Brand with < 5 posts on a platform shows `too_fresh` amber across that platform.
- `npx tsc --noEmit` clean; `npm run lint` clean.
- progress.txt fully `[x]`.
