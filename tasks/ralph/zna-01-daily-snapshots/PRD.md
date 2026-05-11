# PRD: ZNA · 01 · Daily platform snapshots (already-partially-built)

> Zernio Analytics · 01/06 · 2026-05-10

## Purpose & Value

`platform_snapshots` and `post_metrics` already exist (migration 021) and `app/api/cron/sync-reporting` already populates them daily. This PRD does NOT recreate that. It locks the contract, adds Zernio as a first-class source, fills coverage gaps (some platforms still rely on direct scraping rather than Zernio), adds backfill tooling, and writes regression tests so downstream PRDs (ZNA-02..06, SPY-08) can trust the snapshot stream.

## Problem

The existing sync was built incrementally and pre-Zernio. Three concrete gaps:
1. Source attribution: a `platform_snapshots` row doesn't record whether the numbers came from Zernio, direct scrape, or Apify. Downstream consumers can't tell when Zernio data starts being authoritative.
2. Per-platform parity: Zernio coverage is uneven. TikTok watch time is a known roadblock (`feedback_analytics_accuracy_pass_2026_04_23.md`).
3. Backfill: there is no clean way to backfill snapshots for a newly-converted prospect → client. Today, the client gets a flat chart for 30 days.

## Primary User
Internal: future PRDs reading `platform_snapshots` need an authoritative, attributed, gap-free time series. External (indirect): strategist + client see complete charts from day 1.

## SMART Goals
- `platform_snapshots` rows gain a `source` column with values in (zernio, scrape, apify).
- Backfill script can hydrate 90 days of history for a newly converted client in <5 min.
- Sync errors per-platform are persisted in `platform_snapshot_errors` rather than silently swallowed.
- p95 cron run time ≤ 4 min for ≤ 30 active clients.

## User Stories
- **US-01** — As a downstream PRD author, I can query `select source from platform_snapshots` and know exactly where the number came from.
- **US-02** — As Jack, when I convert a prospect to a client, I run one command and the client's last 90 days light up.
- **US-03** — As a future debugger, I can query `platform_snapshot_errors` to see why TikTok watch time was missing on April 22.
- **US-04** — As a system, the cron run isolates platform failures; one TikTok outage does not block Instagram + YouTube snapshots.

## In Scope
- Migration `273_platform_snapshots_source.sql` (note: real migration number assigned in CONTEXT.md is 276 if scaffolding consumes 273; verify before applying. Renumber on apply.) — adds `source` enum column + `platform_snapshot_errors` table.
- `lib/analytics/source-router.ts` exporting `resolveAnalyticsSource(clientId, platform)` (also consumed by SPY-08).
- `lib/analytics/zernio-adapter.ts` and `lib/analytics/scrape-adapter.ts` — wrap existing scrape calls; new Zernio path.
- Refactor `lib/reporting/sync.ts` to call the router instead of hardcoded scrape paths.
- Backfill CLI: `scripts/backfill-platform-snapshots.ts --client=<id> --days=90`.
- Unit tests on source router, adapters, and backfill range math.

## Out of Scope
- Chart UI (ZNA-02).
- AI pulse (ZNA-03).
- Post grid + per-post signals (ZNA-04..06).
- New Zernio API integrations for unsupported metrics (e.g. TikTok watch time — flagged as Zernio roadblock; record gap rather than fix here).

## Resolved Decisions
- **D-01** — Add `source` column or new table? **→ Column.** Rationale: 1:1 with snapshot row; cheap; no join needed.
- **D-02** — Backfill how far? **→ 90 days default, configurable.** Rationale: matches `MEMORY.md` retention norm and ZNA-02 chart's "All" range max.
- **D-03** — Zernio first, scrape fallback, or always both? **→ Router picks one per (client, platform); never both.** Rationale: avoid double counting; router has a clear precedence (zernio if configured, else scrape, else apify).
- **D-04** — Error handling: throw or persist? **→ Persist to `platform_snapshot_errors`, continue.** Rationale: don't let one platform tank the whole run; observability gets a clean trail.
- **D-05** — When a row already exists for (social_profile_id, snapshot_date)? **→ UPSERT on source change only.** Rationale: don't churn rows on every run; only update if source changed or numbers materially differ.

## Data Model

### Migration `<next>_platform_snapshots_source.sql`

```sql
-- ============================================================
-- ZNA-01: Source attribution + error log for analytics sync.
-- Extends migration 021 (platform_snapshots, post_metrics).
-- ============================================================

ALTER TABLE platform_snapshots
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'scrape'
    CHECK (source IN ('zernio','scrape','apify')),
  ADD COLUMN IF NOT EXISTS source_version TEXT,            -- e.g. 'zernio-v2', 'apify-tiktok-1.4'
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: existing rows are scrape. (default covers new rows; explicit for clarity.)
UPDATE platform_snapshots SET source = 'scrape' WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_platform_snapshots_source ON platform_snapshots(source);

-- Mirror on post_metrics for downstream symmetry (ZNA-04..06 need it).
ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'scrape'
    CHECK (source IN ('zernio','scrape','apify')),
  ADD COLUMN IF NOT EXISTS source_version TEXT;
CREATE INDEX IF NOT EXISTS idx_post_metrics_source ON post_metrics(source);

-- Error log
CREATE TABLE IF NOT EXISTS platform_snapshot_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  social_profile_id UUID REFERENCES social_profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','youtube')),
  attempted_source TEXT NOT NULL CHECK (attempted_source IN ('zernio','scrape','apify')),
  error_code TEXT,                                   -- e.g. 'zernio_timeout', 'apify_rate_limited'
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_snapshot_errors_client_time
  ON platform_snapshot_errors(client_id, attempted_at DESC);

ALTER TABLE platform_snapshot_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_snapshot_errors_admin_all ON platform_snapshot_errors
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
```

## API Contracts

### `POST /api/admin/analytics/backfill` (internal, admin-only)
Auth: admin (createServerSupabaseClient → role check).
Request:
```ts
const RequestSchema = z.object({
  client_id: z.string().uuid(),
  days: z.number().int().min(1).max(180).default(90),
  platforms: z.array(z.enum(['tiktok','instagram','facebook','youtube'])).optional(),  // default: all configured
  source_override: z.enum(['zernio','scrape','apify']).optional(),                     // default: router decision
});
```
Response (200):
```ts
{
  job_id: string;
  scheduled_runs: number;
  message: string;
}
```
Behavior: enqueues N daily backfill runs (one per day per platform). Reuses `withCronTelemetry` logging. Either inline (small N) or via per-day chained scheduling. For v1, run inline if `days*platforms ≤ 50`, else queue.
Errors: 400 invalid, 401, 404 client.

(No public/portal API surface from this PRD.)

## LLM Prompts

None.

## TypeScript types + module shape

### `lib/analytics/source-router.ts`
```ts
export type AnalyticsSource = 'zernio' | 'scrape' | 'apify';
export type Platform = 'tiktok' | 'instagram' | 'facebook' | 'youtube';

export interface SourceResolution {
  source: AnalyticsSource;
  source_version: string;
  reason: 'zernio_connected' | 'scrape_fallback' | 'apify_fallback' | 'no_profile';
}

export async function resolveAnalyticsSource(
  clientId: string,
  platform: Platform,
): Promise<SourceResolution | null>;
```

Logic:
1. Query `social_profiles` for `(client_id, platform)` row.
2. If `access_token_ref` indicates Zernio is connected (heuristic: `lib/zernio/ensure-profile.ts` returns active), return `{ source: 'zernio', source_version: 'zernio-v2', reason: 'zernio_connected' }`.
3. Else if platform supported by direct scrape (Instagram, Facebook), `{ source: 'scrape', source_version: '<adapter>' }`.
4. Else if Apify supported, `{ source: 'apify', source_version: 'apify-<actor>' }`.
5. Else null.

### `lib/analytics/zernio-adapter.ts`
```ts
export async function fetchZernioPlatformSnapshot(args: {
  clientId: string;
  socialProfileId: string;
  platform: Platform;
  date: string;       // YYYY-MM-DD UTC
}): Promise<PlatformSnapshotInsert>;

export async function fetchZernioPostMetrics(args: {
  clientId: string;
  socialProfileId: string;
  platform: Platform;
  since: string;
}): Promise<PostMetricInsert[]>;
```

Wraps Zernio API calls (reuse existing `lib/zernio/` clients; if they don't expose the needed endpoints yet, document the gap and fall through to scrape).

### `lib/analytics/scrape-adapter.ts`
Wraps existing `lib/reporting/sync.ts` scrape paths so they're interchangeable with the Zernio adapter via the router.

### `lib/reporting/sync.ts` (refactor)
- `syncSocialProfile()` now calls `resolveAnalyticsSource()` and dispatches to the matching adapter.
- On failure, INSERT into `platform_snapshot_errors` and continue (don't throw).

## UI Components

None in this PRD. (ZNA-02 owns chart UI.)

## File Map

Create:
- `supabase/migrations/<next>_platform_snapshots_source.sql`
- `lib/analytics/source-router.ts`
- `lib/analytics/source-router.test.ts`
- `lib/analytics/zernio-adapter.ts`
- `lib/analytics/scrape-adapter.ts`
- `lib/analytics/types.ts` (add `AnalyticsSource`, `PlatformSnapshotInsert`, `PostMetricInsert`)
- `app/api/admin/analytics/backfill/route.ts`
- `scripts/backfill-platform-snapshots.ts` (CLI wrapper that calls the API route locally)
- `tasks/ralph/zna-01-daily-snapshots/progress.txt`

Modify:
- `lib/reporting/sync.ts` (route through adapters; persist errors)
- `lib/supabase/types.ts` (regenerated)

## Env Vars

None new. Reuses `ZERNIO_*` and `APIFY_TOKEN`.

## Edge Cases

- **Zernio API down mid-run.** Per-profile try/catch; persist `platform_snapshot_errors` row with `error_code='zernio_timeout'`; do NOT fall back to scrape on a single bad call (would mix sources within a day). Mark the day's snapshot missing; next run picks up.
- **Source change mid-history.** When a client converts (SPY-07/08), historical rows stay as `scrape`/`apify` while new rows are `zernio`. Charts must read whichever exists.
- **Day boundary.** All snapshot_dates are UTC dates. Confirm in router that `captured_at` reflects the actual fetch time (TIMESTAMPTZ) while `snapshot_date` reflects the bucketed day.
- **Existing row UPSERT.** ON CONFLICT (social_profile_id, snapshot_date) DO UPDATE only if `source` changed OR any metric column differs by ≥ 1. Otherwise skip (no churn).
- **No social_profiles row.** `resolveAnalyticsSource` returns null; sync skips this platform for that client (existing behavior).

## Test Plan

Unit:
- `lib/analytics/source-router.test.ts`: covers each branch (zernio connected, scrape fallback, apify, none).
- `lib/reporting/sync.test.ts` (new or extend): mocked adapter returns row; UPSERT semantics; error persistence path.

Integration:
- Run cron handler against a fixture client with one Zernio-connected profile and one scrape-only profile. Assert two rows with different `source` values.

Manual QA:
- Trigger backfill for Nike demo client (`27b2baa6-17b0-4a14-a96a-005684d199fd`): `pnpm tsx scripts/backfill-platform-snapshots.ts --client=27b2baa6 --days=30`. Check rows.

## Architecture Wiring

- Plugs into `lib/reporting/sync.ts` which is invoked by `app/api/cron/sync-reporting`. No new cron route.
- `lib/analytics/source-router.ts` is the seed of the `lib/analytics/` directory; ZNA-02..06 and SPY-08 import from here.
- Backfill API mirrors existing `app/api/admin/...` admin-only patterns.

## Done When

- Migration applied; new columns + table visible.
- `lib/analytics/source-router.ts` exports + tests green.
- Cron run on staging populates rows with correct `source` values.
- Backfill CLI hydrates 90 days for a target client; rows visible.
- `platform_snapshot_errors` gains a row when Zernio is intentionally tripped (manual test).
- No TS errors, no lint warnings.
- progress.txt fully `[x]`.
