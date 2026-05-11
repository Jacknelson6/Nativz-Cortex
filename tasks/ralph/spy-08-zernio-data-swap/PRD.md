# PRD: SPY · 08 · Zernio data swap-in

> Spying → Prospect Pipeline · 08/10 · 2026-05-10

## Purpose & Value

Post-conversion, scraping becomes redundant. Once the client connects their socials via Zernio, we have first-party analytics that are richer + cheaper + faster than ongoing scrapes. This phase flips the data source automatically and cleanly without breaking the historical view, behind a single helper every analytics surface calls.

## Problem

A client paying us shouldn't be analyzed via the same expensive scraper-based pipeline as a cold prospect. Once Zernio is connected, every dashboard view should pull from Zernio for live data, with the scrape history preserved as a "before we worked together" baseline.

## Primary User

Strategist working day-to-day on a converted client. Editor / shooter referencing client analytics. Admin debugging analytics discrepancies.

## SMART Goals

- Per-platform: when Zernio data is available, all live-data views read from Zernio. Otherwise fall through to scrape pipeline (or `none` state with empty UI).
- Switchover happens automatically within 24h of Zernio connection (one daily reconcile is sufficient; live calls also re-check).
- Historical prospect-era scrape data remains queryable with a clear "pre-Zernio" pill.
- No double-counting in metrics dashboards (single source per chart per range).
- Zero-touch from strategists; no toggles to flip.

## User Stories

- **US-01** — As a strategist, when a client connects TikTok via Zernio, the analytics page for that client shifts to Zernio data within 24h and shows a "Pre-Zernio data" pill for the period before connection.
- **US-02** — As an admin, I can see a clear "data source" indicator on every analytics surface (Zernio / Scrape / Mixed / None).
- **US-03** — As a developer, a single `resolveAnalyticsSource(client_id, platform, range)` helper decides which source to read; the rest of the app doesn't have to know.
- **US-04** — As a system, when Zernio token expires or webhook stops for >24h, I push-notify admin to investigate; the UI shows a stale warning banner but keeps showing the last-known-good Zernio data.

## In Scope

- `lib/analytics/source-router.ts`: pure resolver function.
- `lib/analytics/adapters/zernio.ts` + `lib/analytics/adapters/scrape.ts` implementing a common `AnalyticsAdapter` interface.
- `lib/analytics/data-source.ts`: combined entry point — `getAnalyticsForRange(client_id, platform, range)` that calls resolver + adapter.
- UI: `components/analytics/data-source-pill.tsx` shown on every analytics card.
- Daily reconcile cron `app/api/cron/zernio-reconcile/route.ts` that checks every active client's Zernio connection and flags stale.
- Fallback monitoring + push notification on stale Zernio.
- No migration (existing `client_zernio_connections` + ZNA tables suffice). Optionally a thin `analytics_source_log` view for debugging.

## Out of Scope

- Building Zernio analytics from scratch (those are ZNA-01 through ZNA-06; this PRD assumes they exist).
- Migrating historical scrape data into a "Zernio-shaped" warehouse (keep them separate).
- Per-metric source mixing within a single chart (use one source per visualization).
- Strategist override toggles (D-03).

## Resolved Decisions

- **D-01** — What counts as "Zernio-ready"? **→ Token valid AND first sync complete (i.e., at least one row in the ZNA-01 daily analytics table for this client + platform).** Rationale: connection without data is misleading.
- **D-02** — When Zernio fails for >24h, revert to scrape silently or stay stale? **→ Stay on stale Zernio with a warning banner; do NOT silently swap.** Rationale: silent source swap causes "the numbers changed" support tickets.
- **D-03** — Strategist manual override? **→ No v1; single source per surface.** Rationale: simplicity; revisit if real demand emerges.
- **D-04** — Where does the resolver run? **→ Server only; called from API routes + RSC. Never client-side.** Rationale: relies on admin DB access.
- **D-05** — Adapter interface contract? **→ Both adapters return `{ source: 'zernio'|'scrape', generated_at, items: AnalyticsPoint[] }` where AnalyticsPoint is platform-agnostic (followers, posts, engagement, etc.).** Rationale: callers stay platform-agnostic.
- **D-06** — Range that straddles connect date? **→ Resolver returns `'mixed'`; data-source.ts returns Zernio for post-connect days + scrape for pre-connect days, both labeled.** Rationale: continuity in trend lines.
- **D-07** — How to detect ZNA-01 first-sync? **→ Query `zernio_platform_analytics` (or whatever ZNA-01 names it) for >=1 row in last 7 days per client+platform.** Rationale: simple, no extra state.
- **D-08** — Stale threshold? **→ 24h without a new ZNA row.** Rationale: ZNA-01 is daily.
- **D-09** — Pill copy? **→ "Live" (Zernio), "Pre-Zernio" (scrape only), "Mixed" (range spans), "No data" (none).** Rationale: client-friendly, no jargon.
- **D-10** — Reconcile cron schedule? **→ `0 6 * * *` daily; iterates all clients with connections; pushes admin alert for any client with stale Zernio > 24h.** Rationale: catches token expiries within a day.
- **D-11** — Fallback when both fail? **→ Empty state "We're rebuilding this view, check back shortly" + push to admin.** Rationale: never crash the analytics page.
- **D-12** — Caching? **→ Wrap resolver+adapter in `unstable_cache` with 5-min TTL keyed by client+platform+range hash.** Rationale: analytics pages re-render frequently.

## Data Model

No new tables. Optional helper view:

```sql
-- Migration NOT required; if shipped, would be cosmetic for debugging.
-- (Listed here for completeness; can be omitted v1.)
```

Reads from existing tables:
- `client_zernio_connections` (existing)
- `zernio_platform_analytics` (ZNA-01)
- `prospect_monitor_snapshots` (SPY-06, for converted clients via `clients.converted_from_prospect_id → prospects → snapshots`)
- `prospect_audits` (SPY-01)

## Types

`lib/analytics/types.ts`:

```ts
export type AnalyticsSource = 'zernio' | 'scrape' | 'mixed' | 'none';

export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'x';

export interface AnalyticsRange {
  from: string; // ISO date
  to: string;
}

export interface AnalyticsPoint {
  date: string;
  followers: number | null;
  posts: number | null;
  engagement_rate: number | null;
  views: number | null;
  source: 'zernio' | 'scrape';
}

export interface AnalyticsResult {
  source: AnalyticsSource;
  generated_at: string;
  stale: boolean;
  items: AnalyticsPoint[];
}

export interface AnalyticsAdapter {
  fetch(clientId: string, platform: SocialPlatform, range: AnalyticsRange): Promise<AnalyticsPoint[]>;
}
```

## Resolver Contract

`lib/analytics/source-router.ts`:

```ts
export async function resolveAnalyticsSource(args: {
  clientId: string;
  platform: SocialPlatform;
  range: AnalyticsRange;
}): Promise<{
  source: AnalyticsSource;
  connectedAt: string | null;
  staleZernio: boolean;
}>;
```

Decision logic:
1. Look up `client_zernio_connections` for client+platform.
2. If none → check scrape data exists (via `converted_from_prospect_id`) → return `'scrape'` or `'none'`.
3. If connection exists but no ZNA rows in last 7d → return `'scrape'` if scrape data exists else `'none'`.
4. If ZNA rows exist:
   - `connectedAt` = first ZNA row date.
   - If `range.to < connectedAt` → `'scrape'`.
   - If `range.from >= connectedAt` → `'zernio'`.
   - Otherwise → `'mixed'`.
   - `staleZernio` = max(zna.date) < now - 24h.

## API Surface

### `GET /api/clients/[id]/analytics/source`

```ts
// Zod query
const Query = z.object({
  platform: z.enum(['tiktok','instagram','youtube','facebook','x']),
  from: z.string().date(),
  to: z.string().date(),
});
```

Response: `{ source, connectedAt, staleZernio }`.

Auth: admin OR portal scoped to client's organization.

### `GET /api/cron/zernio-reconcile`

Auth via `CRON_SECRET`. Iterates all active connections; for each stale > 24h, pushes admin notification. Returns `{ checked: N, stale: M }`.

## Components

### `components/analytics/data-source-pill.tsx`

Props:
```ts
{
  source: AnalyticsSource;
  stale?: boolean;
  connectedAt?: string | null;
}
```

Renders:
- `source='zernio'` + `!stale` → green dot + "Live"
- `source='zernio'` + `stale` → amber dot + "Live (stale)" + tooltip "Last sync >24h ago"
- `source='scrape'` → grey dot + "Pre-Zernio"
- `source='mixed'` → blue dot + "Mixed" + tooltip explaining split
- `source='none'` → grey dot + "No data"

Tokens: existing pill primitive (look at `components/ui/pill.tsx` or equivalent). No new design tokens.

### `components/analytics/analytics-card-shell.tsx`

Wrapper that takes children + `clientId` + `platform` + `range`; fetches resolver server-side, renders header with title + DataSourcePill, slots the chart below.

Props:
```ts
{
  title: string;
  clientId: string;
  platform: SocialPlatform;
  range: AnalyticsRange;
  children: ReactNode;
}
```

## File Inventory

New files:
- `lib/analytics/types.ts`
- `lib/analytics/source-router.ts`
- `lib/analytics/source-router.test.ts`
- `lib/analytics/adapters/zernio.ts`
- `lib/analytics/adapters/scrape.ts`
- `lib/analytics/data-source.ts`
- `lib/analytics/data-source.test.ts`
- `app/api/clients/[id]/analytics/source/route.ts`
- `app/api/cron/zernio-reconcile/route.ts`
- `components/analytics/data-source-pill.tsx`
- `components/analytics/analytics-card-shell.tsx`
- `tests/integration/analytics-source-router.test.ts`

Edited files:
- `vercel.json` (cron `0 6 * * *` for zernio-reconcile)
- 3 reference analytics surfaces wrapped to demonstrate (pick the three most-trafficked client analytics pages; record in Notes).

## Edge Cases

- No Zernio connection, no scrape history → source='none', empty state.
- Zernio token revoked mid-day → next reconcile catches; pill flips to stale.
- Range spans connect date by 1 day → mixed.
- Multiple platforms per client, different sources per platform → each card independently labeled.
- Portal user viewing → resolver respects org scoping via getPortalClient().
- Client-id with no prospect lineage (created manually pre-SPY-07) → scrape adapter returns empty; source='none' until Zernio connects.
- ZNA-01 not yet shipped at integration time → adapter returns empty; resolver always returns 'scrape' or 'none'. Document this as a known transitional state.

## Verify Gates

- `npx tsc --noEmit`
- `npx vitest run lib/analytics/source-router.test.ts`
- `npx vitest run lib/analytics/data-source.test.ts`
- Integration test with seeded ZNA + scrape data covering all 4 source states.
- Visual QA: 3 wrapped analytics surfaces showing correct pills.
- Manual stale simulation (set ZNA last_sync to 25h ago, run reconcile, confirm push).

## Done When

- Source router shipped + tested on 3 client analytics surfaces.
- Real swap-over verified for at least 1 newly-converted client (track in Notes).
- Data-source pill renders on every wrapped analytics card.
- Fallback alerting verified by simulating a Zernio token failure.
- Reconcile cron entry in vercel.json; running daily; logs visible.
- `resolveAnalyticsSource` covered by unit tests for all 4 outputs and the mixed-range split.

## Dependencies (Cross-PRD)

- ZNA-01 must define and populate `zernio_platform_analytics` (or equivalent name). If ZNA-01 ships later, this PRD's adapter returns empty + source falls back gracefully; integrate fully once ZNA-01 lands.
- SPY-07 conversion must preserve scrape history via `clients.converted_from_prospect_id`.
