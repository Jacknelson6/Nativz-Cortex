# PRD: ZNA · 02 · Per-platform growth line charts

> Zernio Analytics · 02/06 · 2026-05-10

## Purpose & Value

ZNA-01 locked the snapshot stream. This PRD reads `platform_snapshots` and renders a clean daily line chart per connected platform, with three series (followers, rolling-7d views, rolling-7d engagements) and a delta callout. The chart answers "is this account growing, flat, or declining?" at a glance with zero noise. It is the first user-visible surface in the ZNA series and the foundation strategists pull up before every client call.

## Problem

Today's analytics surfaces dump dozens of small numbers without trajectory. Clients want the line, up means good, down means problem. The legacy "best posting time" widget and "best day of week" widget add cognitive load without delivering decisions. A trajectory across 30 days is more useful than a one-day count, particularly during quarterly reviews. No chart UI currently reads `platform_snapshots`, so the data is invisible.

## Primary User

Strategist preparing a client review (admin). Client viewing their own portal (viewer).

## SMART Goals

- Charts render in p95 ≤ 500 ms on a brand with 90 days of snapshots.
- Date range toggle exposes 7d / 30d / 90d / All, default 30d, persisted in URL query.
- Three line series per platform: followers, rolling 7d views, rolling 7d engagements.
- Delta callout adjacent to each chart, percentage delta vs the previous equal-length window, suppressed when prior window is sparse (<60% coverage).
- Zero deprecated widgets ship (no posting times, no best day, no time-of-day heatmap).

## User Stories

- **US-01** — As a strategist, on the analytics page I see one card per connected platform, each with three series (followers, views 7d, engagements 7d).
- **US-02** — As a strategist, I can toggle 7d / 30d / 90d / All and the chart re-renders without page reload, URL updates.
- **US-03** — As a client viewer, on `/portal/analytics` I see the same charts scoped to my organization, read only.
- **US-04** — As a strategist, I see a delta pill next to each chart, "+18% followers vs prior 30 days", suppressed when prior window is sparse.
- **US-05** — As a strategist, when a platform has zero snapshots I see an empty-state card with copy "Connect Zernio to see growth charts." and no broken axes.

## In Scope

- API route `GET /api/analytics/zernio/timeseries` (admin) and `GET /api/portal/analytics/zernio/timeseries` (viewer).
- Page `app/admin/analytics/zernio/page.tsx` rendering one chart card per platform on the active brand.
- Portal page `app/portal/analytics/page.tsx` rendering the same charts.
- Components:
  - `components/analytics/zernio-growth-chart.tsx` (Recharts, three series).
  - `components/analytics/zernio-delta-callout.tsx` (percentage + sparkline + sparse-window suppression).
  - `components/analytics/zernio-range-toggle.tsx` (7d / 30d / 90d / All segmented control).
  - `components/analytics/zernio-platform-card.tsx` (header + chart + delta).
- Library:
  - `lib/analytics/zernio-timeseries.ts` (query + transform + rolling math).
  - `lib/analytics/zernio-delta.ts` (delta vs prior window + sparse check).
- Admin sidebar entry under Intelligence → Analytics → Zernio (Title Case in sidebar per convention).

## Out of Scope

- AI insights pulse copy (ZNA-03).
- Per-post grid (ZNA-04).
- Per-post good/bad signal (ZNA-05).
- Per-post trajectory (ZNA-06).
- Cross-platform combined view (one chart per platform v1).
- Engagement rate chart (ZNA-05 hover detail).
- Cumulative-totals chart, since per-day movement is the question being answered.

## Resolved Decisions

- **D-01** — Engagements series: likes + comments + shares, or include saves? **→ likes + comments + shares.** Rationale: saves are unevenly reported across platforms (Facebook returns null, YouTube returns 0); dropping saves keeps the series comparable across platforms.
- **D-02** — Show engagement rate as a secondary series here? **→ No.** Rationale: ZNA-05 surfaces per-post ER; engagement-rate at platform level is a derived noisy metric and clutters the line chart.
- **D-03** — Y-axis scale, linear or log? **→ Linear, with separate axis per series.** Rationale: log makes a 50→100 jump look identical to 10k→20k and confuses clients; per-series axis avoids one large series flattening the others.
- **D-04** — Default range? **→ 30 days.** Rationale: matches strategist quarterly cadence; 7 days reads as noise on most brands.
- **D-05** — Date range "All" cap? **→ 90 days.** Rationale: retention norm in `MEMORY.md`; older data is held but `All` caps to keep the request fast and the X axis legible.
- **D-06** — Rolling window size? **→ 7 days.** Rationale: weekly cadence aligns with platform reporting and the strategist mental model; 1-day raw points are noisy on TikTok views.
- **D-07** — Sparse-window threshold? **→ Suppress delta when prior window has <60% of expected daily rows.** Rationale: aligns with `feedback_analytics_accuracy_pass_2026_04_23.md`; 60% covers Zernio's occasional missed days while still rejecting cold-start brands.
- **D-08** — Where does the brand picker live? **→ Brand pill only; no in-page client picker.** Rationale: `feedback_analytics_brand_pill_only.md`; `useReportingData` already derives `selectedClientId` from prop.
- **D-09** — How is the chart fed from the page, client or server? **→ Server fetch in `page.tsx`, hand off to client `'use client'` chart component as initial data, plus a SWR-style client revalidate on range change.** Rationale: faster first paint, range toggle is interactive.
- **D-10** — Portal data fetch uses RLS or admin-with-org-filter? **→ `createServerSupabaseClient()` so RLS does the filter, with a defense-in-depth org filter on top.** Rationale: portal hard rule; double defense matches existing portal patterns.
- **D-11** — Cache TTL on the timeseries route? **→ `Cache-Control: private, max-age=60`.** Rationale: snapshots are daily; 60s is enough to deduplicate range-toggle thrash without staleness.
- **D-12** — Series color tokens? **→ followers `accent-text`, views `text-emerald-400`, engagements `text-violet-300`.** Rationale: matches dark theme tokens; sentiment carve-out only applies to `sentiment-split-bar.tsx`, not generic charts; emerald + violet read distinctly at chart scale.
- **D-13** — What about platforms with no `source` from ZNA-01? **→ Treat as scrape source and render normally.** Rationale: ZNA-01 backfills `source='scrape'` on existing rows so this column is always populated.
- **D-14** — How do we know which platforms to render? **→ Render one card per `social_profiles` row attached to the brand (where `is_active=true`), in order tiktok, instagram, youtube, facebook.** Rationale: stable platform order matches existing analytics screens.

## Data Model

No new schema. Reads existing tables only.

- `platform_snapshots(social_profile_id, client_id, platform, snapshot_date, followers_count, views_count, engagement_count, engagement_rate, posts_count, source, source_version, captured_at)`.
- `social_profiles(id, client_id, platform, username, avatar_url, is_active)`.
- `clients(id, organization_id, name)`.

## API Contracts

### `GET /api/analytics/zernio/timeseries`

Auth: admin (`createAdminClient()` with role check).

Query parameters validated by Zod:

```ts
const QuerySchema = z.object({
  client_id: z.string().uuid(),
  platform: z.enum(['tiktok', 'instagram', 'facebook', 'youtube']),
  range: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
});
```

Response (200):

```ts
type TimeseriesResponse = {
  client_id: string;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube';
  range: '7d' | '30d' | '90d' | 'all';
  range_start: string;       // YYYY-MM-DD
  range_end: string;         // YYYY-MM-DD
  source: 'zernio' | 'scrape' | 'apify' | 'mixed' | 'none';
  points: Array<{
    date: string;            // YYYY-MM-DD
    followers: number;
    views_rolling_7d: number;
    engagements_rolling_7d: number;
  }>;
  delta: {
    metric: 'followers' | 'views_rolling_7d' | 'engagements_rolling_7d';
    current_mean: number;
    prior_mean: number;
    delta_pct: number | null;       // null when suppressed
    suppressed: boolean;
    suppressed_reason: 'sparse_prior_window' | null;
  };
};
```

Errors: 400 invalid input, 401 unauthorized, 404 social profile not found, 500 server.

### `GET /api/portal/analytics/zernio/timeseries`

Auth: portal (`getPortalClient()` → `{ user, client, organization_id }`).

Query parameters:

```ts
const PortalQuerySchema = z.object({
  platform: z.enum(['tiktok', 'instagram', 'facebook', 'youtube']),
  range: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
});
```

Behavior: derives `client_id` from `getPortalClient()`, hard filters `platform_snapshots` by both `client_id` AND `organization_id` via a join through `clients.organization_id = $portalOrgId`. Response shape identical to admin route.

Errors: 401 unauthorized (no portal session), 403 client paused, 404 no social profile, 500 server.

## LLM Prompts

None.

## TypeScript types + module shape

### `lib/analytics/zernio-timeseries.ts`

```ts
export type RangeKey = '7d' | '30d' | '90d' | 'all';
export type Platform = 'tiktok' | 'instagram' | 'facebook' | 'youtube';

export interface TimeseriesPoint {
  date: string;
  followers: number;
  views_rolling_7d: number;
  engagements_rolling_7d: number;
}

export interface TimeseriesResult {
  range_start: string;
  range_end: string;
  source: 'zernio' | 'scrape' | 'apify' | 'mixed' | 'none';
  points: TimeseriesPoint[];
}

export async function loadZernioTimeseries(args: {
  supabase: SupabaseClient;
  clientId: string;
  platform: Platform;
  range: RangeKey;
}): Promise<TimeseriesResult>;
```

Behavior:

1. Resolve `range_start` / `range_end` from `range` (`all` caps to 90 days).
2. Query `platform_snapshots` where `client_id = $clientId AND platform = $platform AND snapshot_date BETWEEN range_start AND range_end ORDER BY snapshot_date ASC`.
3. Materialize a date spine across the range (fill gaps with the previous day's followers for monotone display; `views_rolling_7d` and `engagements_rolling_7d` from rolling sum of raw daily deltas).
4. Compute `source`: if all rows agree return that source, else `'mixed'`; if no rows return `'none'`.
5. AI fields null-safe: `followers ?? 0`, `views ?? 0`, `engagement_count ?? 0`.

### `lib/analytics/zernio-delta.ts`

```ts
export interface DeltaResult {
  metric: 'followers' | 'views_rolling_7d' | 'engagements_rolling_7d';
  current_mean: number;
  prior_mean: number;
  delta_pct: number | null;
  suppressed: boolean;
  suppressed_reason: 'sparse_prior_window' | null;
}

export function computeDelta(args: {
  points: TimeseriesPoint[];
  range: RangeKey;
  metric: DeltaResult['metric'];
}): DeltaResult;
```

Behavior:

1. Split `points` into `current` (most recent N days) and `prior` (N days before that), where N is the range length (7, 30, or 90; `all` uses 30).
2. If `prior.length / N < 0.6` set `suppressed=true`, `delta_pct=null`, reason `sparse_prior_window`.
3. Else `delta_pct = (current_mean - prior_mean) / prior_mean * 100`, rounded to one decimal; guard against division by zero (`prior_mean === 0` → `suppressed=true`).
4. The page picks `followers` as the default metric for the callout.

### `lib/analytics/types.ts` (extend if ZNA-01 created it)

Add `RangeKey`, `TimeseriesPoint`, `TimeseriesResult`, `DeltaResult` exports.

## UI Components

### `components/analytics/zernio-platform-card.tsx`

Purpose: bounded surface that wraps header (platform name + handle + avatar), the chart, and the delta callout for one platform.

Props:

```ts
type Props = {
  clientId: string;
  platform: Platform;
  initial: TimeseriesResult;
  initialDelta: DeltaResult;
  isPortal?: boolean;
};
```

Layout: `IconCard`-style, `bg-surface` rounded card, header row with platform icon (h-9 w-9 accent swatch tinted per platform), handle text-sm, delta pill right aligned. Body holds chart with min-h-[240px]. Footer row holds `<ZernioRangeToggle />`.

Copy:

- Header platform labels (sentence case): "TikTok", "Instagram", "YouTube", "Facebook".
- Empty state title: "No snapshots yet"
- Empty state body: "Connect Zernio to see growth charts."
- Tooltip on header `?`: "Daily snapshot of your account, sourced from Zernio when connected."

States: loading (skeleton shimmer in chart area, height matched), empty (no points → empty state card), error (single line "Couldn't load this platform. Refresh to retry.", no stack), success.

Tokens: `bg-surface`, `text-foreground`, `text-muted-foreground`, `accent-text`, `border-border`.

### `components/analytics/zernio-growth-chart.tsx`

Top of file: `'use client'`.

Purpose: Recharts `LineChart` with three series.

Props:

```ts
type Props = {
  points: TimeseriesPoint[];
  height?: number;            // default 240
};
```

Layout: full-width Recharts `ResponsiveContainer`; three `<Line>` elements; X axis dates formatted as "MMM d" via `date-fns`; per-series Y axis (Recharts `yAxisId`). Legend below chart, sentence case labels.

Series:

- "Followers" — `accent-text` token color, `strokeWidth={2}`, `dot={false}`, `yAxisId="followers"`.
- "Views (7d avg)" — emerald 400, `strokeWidth={2}`, `dot={false}`, `yAxisId="views"`.
- "Engagements (7d avg)" — violet 300, `strokeWidth={2}`, `dot={false}`, `yAxisId="engagements"`.

Tooltip: dark `bg-popover`, displays date and three values formatted with `Intl.NumberFormat('en-US', { notation: 'compact' })`.

States: empty (returns null; parent shows empty state), 1-point (degrades gracefully, single dot).

### `components/analytics/zernio-delta-callout.tsx`

Top of file: `'use client'`.

Purpose: small pill next to the chart header showing percentage delta vs prior window, with mini sparkline.

Props:

```ts
type Props = {
  delta: DeltaResult;
  sparkline: number[];        // last N values of the metric
};
```

Layout: inline-flex pill, `h-7`, `px-2.5`, `rounded-full`, `bg-surface-2`. Left: arrow icon from `lucide-react` (`ArrowUpRight` if `delta_pct > 0`, `ArrowDownRight` if `< 0`, `Minus` if `== 0` or suppressed). Middle: percentage formatted to one decimal with sign, or "Not enough data" when suppressed. Right: sparkline (`recharts` `LineChart` in a 56x20 container, `accent-text` stroke).

Copy:

- Positive delta: e.g. "+18.0% followers vs prior 30 days"
- Negative delta: e.g. "-4.2% followers vs prior 30 days"
- Suppressed: "Not enough data vs prior window"

Tokens: emerald 400 text for positive, red 400 text for negative, muted foreground for zero / suppressed.

### `components/analytics/zernio-range-toggle.tsx`

Top of file: `'use client'`.

Purpose: segmented control that updates `?range=` in the URL and triggers a client refetch.

Props:

```ts
type Props = {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
};
```

Layout: four buttons in a `border` `rounded-full` group, active state `bg-surface-2 accent-text`. Buttons must never wrap (`whitespace-nowrap` already in `<Button>` primitive).

Copy: "7 days", "30 days", "90 days", "All". Sentence case.

### `app/admin/analytics/zernio/page.tsx`

Purpose: server component. Reads brand from `searchParams.clientId`, fetches one timeseries per platform on the server, hands off to `ZernioPlatformCard` client components.

Behavior:

1. Resolve current admin user via `createAdminClient()` and role check.
2. If `searchParams.clientId` missing, render the brand pill chrome with empty state "Pick a brand to see growth charts."
3. List `social_profiles` for the active brand where `is_active=true`, fixed platform order tiktok / instagram / youtube / facebook.
4. For each platform, call `loadZernioTimeseries()` and `computeDelta()` server-side; pass as `initial` to the card.
5. Layout: vertical stack on mobile, 2-column on `lg`.

### `app/portal/analytics/page.tsx`

Purpose: portal mirror. `getPortalClient()` yields `{ client, organization_id }`. Same render as admin minus the brand pill (single brand only).

## File Map

Create:

- `app/admin/analytics/zernio/page.tsx`
- `app/portal/analytics/page.tsx`
- `app/api/analytics/zernio/timeseries/route.ts`
- `app/api/portal/analytics/zernio/timeseries/route.ts`
- `components/analytics/zernio-platform-card.tsx`
- `components/analytics/zernio-growth-chart.tsx`
- `components/analytics/zernio-delta-callout.tsx`
- `components/analytics/zernio-range-toggle.tsx`
- `lib/analytics/zernio-timeseries.ts`
- `lib/analytics/zernio-delta.ts`
- `lib/analytics/zernio-timeseries.test.ts`
- `lib/analytics/zernio-delta.test.ts`
- `tasks/ralph/zna-02-growth-charts/progress.txt`

Modify:

- `lib/analytics/types.ts` (add range + timeseries + delta types).
- `components/layout/admin-sidebar.tsx` (add Analytics → Zernio link under Intelligence; Title Case).
- `components/layout/portal-sidebar.tsx` (add Analytics link; sentence case).

## Env Vars

None new. Existing `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` cover server reads.

## Edge Cases

- **Brand has zero `social_profiles`.** Page renders a single empty state card with copy "No connected platforms yet." and a link to the connections page; no chart cards render.
- **Platform has snapshots but zero followers across the window.** Followers line renders flat at zero; views and engagement series still render; delta pill is `0.0%` not suppressed.
- **Prior window entirely empty.** `computeDelta` returns suppressed; pill renders "Not enough data vs prior window".
- **Mixed sources within the window (Zernio + scrape).** Response sets `source: 'mixed'`; UI shows a small "Mixed sources" tooltip on the platform header.
- **Range = `all` but the brand only has 4 days of data.** Chart renders 4 points; delta pill suppressed (4/30 < 60%).
- **Snapshot date in the future (clock drift).** Filter out `snapshot_date > today UTC` server-side.
- **Negative `followers_change` (rare unfollow burst).** Allowed; followers line dips; no special handling.
- **Portal user attempts to fetch a different brand's `client_id`.** Server route ignores any client_id input and uses `getPortalClient()` resolution; defence in depth org filter on the join.
- **Rolling 7d on day 1.** Rolling window short-circuits to the available data; visible to the user as "(7d avg)" label, no banner.
- **Multiple snapshots per day (re-runs).** Use the row with the latest `captured_at` per `snapshot_date`; library de-dupes server-side.

## Test Plan

Unit:

- `lib/analytics/zernio-timeseries.test.ts`: gap-fill spine math, rolling 7d math, multi-row dedupe by `captured_at`, source aggregation (`mixed` when two values present).
- `lib/analytics/zernio-delta.test.ts`: positive delta, negative delta, suppressed sparse prior, zero prior mean guard, range `all` uses 30-day comparison.

Integration:

- API route `/api/analytics/zernio/timeseries`: 400 on bad input, 401 unauthorized, 200 success against a seeded brand with 30 days of snapshots.
- API route `/api/portal/analytics/zernio/timeseries`: portal session yields scoped result; missing portal session returns 401; cross-org client_id is ignored.

Manual QA:

- Load `/admin/analytics/zernio?clientId=27b2baa6-17b0-4a14-a96a-005684d199fd` (Nike demo), see 30-day chart per platform.
- Toggle 7d / 90d / All, observe URL update and re-render.
- Visit `/portal/analytics` after impersonating a viewer; verify same charts, no brand pill chrome.

## Architecture Wiring

- Reads `platform_snapshots` populated by ZNA-01 `lib/reporting/sync.ts`; never writes.
- Recharts is already a dependency; no new chart library.
- `getPortalClient()` from `lib/portal/get-portal-client.ts` handles the portal scoping; defence-in-depth org filter still added to the join per CLAUDE.md.
- `lib/analytics/source-router.ts` is not invoked here directly, but the `source` column it writes is what feeds the response's `source` field.
- Admin sidebar entry lands under Intelligence section, Title Case label "Analytics" (existing) and Title Case child "Zernio".

## Done When

- Migration: none required.
- `lib/analytics/zernio-timeseries.ts` + `lib/analytics/zernio-delta.ts` exist with tests green.
- `/admin/analytics/zernio?clientId=...` renders one card per connected platform with three series and a delta pill.
- `/portal/analytics` renders identical cards, org-scoped, no leaks across organizations (verified with two seeded orgs).
- Range toggle 7d / 30d / 90d / All updates the URL and refetches.
- Sparse prior windows show "Not enough data" in the delta pill, never a spurious percentage.
- `npx tsc --noEmit` clean; `npm run lint` clean.
- Visual QA: matches existing admin shell density and dark tokens, no posting-time widgets, no best-day widgets.
- progress.txt fully `[x]`.
