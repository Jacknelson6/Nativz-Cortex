# PRD: Zernio Analytics, Phase 01 — Daily Platform Snapshots

> Series: Zernio Analytics · 01/06 · Draft 2026-05-10

## Purpose & Value

Zernio exposes connection-by-connection metrics, but we need daily timeseries we control. This phase stands up a `platform_snapshots` table + daily cron that captures per-platform metrics for every connected client, every day. Everything downstream (line charts, trend insights, post grid) reads from these snapshots.

## Problem

Zernio's API is real-time but expensive to repeatedly query and slow to render dashboards from. Without a local timeseries, every dashboard load re-fetches and we can't query historical trends efficiently. We need a controlled, queryable timeseries layer in Postgres.

## Primary User

System (data foundation). Strategist + client consume the downstream charts.

## Goals (SMART)

- 100% of connected platforms (TikTok / IG / YT / FB) snapshot daily.
- Snapshot ingestion completes in <30 min for all clients (parallelized).
- Snapshot cost ≤ $0.01 per client per platform per day (mostly Zernio call cost + Postgres write).
- ≥99% snapshot success rate (failures retry within 1h).

## User Stories

- **US-01** — As a developer, I can query `platform_snapshots WHERE client_id=X AND platform='tiktok' AND captured_at::date BETWEEN ...` and get a clean daily timeseries.
- **US-02** — As an admin, the daily snapshot run logs to `cron_runs` (or activity_log) so I can verify it fired.
- **US-03** — As a system, when a platform's snapshot fails for a client (token expired, etc.), I record the failure + flag the client for token refresh.
- **US-04** — As a developer, I can backfill snapshots for a client from Zernio's available history via `npx tsx scripts/backfill-snapshots.ts <clientId>`.

## In Scope

- Migration `171_platform_snapshots.sql`:
  - `platform_snapshots` (id, client_id, platform, captured_at, followers, following nullable, posts_count, total_views_7d, total_engagements_7d, profile_pic_url, bio_snippet, raw jsonb).
  - Unique constraint on (client_id, platform, captured_at::date).
- Cron route: `app/api/cron/platform-snapshots/route.ts` — fires 02:00 UTC daily.
- Logic:
  1. List active clients with Zernio connections.
  2. For each (client, platform), call Zernio API for current metrics.
  3. Upsert into `platform_snapshots`.
  4. On failure: log + flag connection for review.
- Backfill script: `scripts/backfill-snapshots.ts` for historical Zernio data.

## Out of Scope

- Visualization (ZNA-02).
- LLM insights (ZNA-03).
- Per-post snapshots (ZNA-04 has its own model).

## Architecture Wiring

- Reuses Zernio API client (verify existing wrapper in `lib/posting/` or `lib/social/`).
- Reuses `createAdminClient()` for cross-tenant writes.
- Cron timing tuned to off-peak so as not to interfere with daytime app usage.
- Logs to `api_error_log` on failure with tag `zna_snapshot`.

## Open Questions

1. Should we snapshot followers count even when posts_count didn't change? (Default: yes — followers movement is the most important metric.)
2. Bio + profile pic in the snapshot — daily, or only when changed? (Default: daily but cheap; change-detection adds complexity for little gain.)
3. Per-post metrics in snapshots, or only profile-level here? (Default: profile-level only; ZNA-04 handles per-post.)

## Assumptions

- Zernio's API supports the metrics we need at acceptable rate limits (verify per platform).
- Daily cadence is enough — we don't need hourly granularity for client-facing dashboards.
- Backfill data exists in Zernio for ≥90 days; otherwise we start the timeseries at connection date.

## Done When

- Migration applied.
- Cron runs successfully for 7 consecutive days.
- 100% of active client / platform combinations have daily snapshot rows for that period.
- Backfill script tested on at least 2 clients.
