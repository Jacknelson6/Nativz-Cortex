# PRD: Spying → Prospect Pipeline, Phase 08 — Zernio Data Swap-In

> Series: Spying / Prospect Pipeline · 08/10 · Draft 2026-05-10

## Purpose & Value

Post-conversion, scraping becomes redundant. Once the client connects their socials via Zernio, we have first-party analytics that are richer + cheaper + faster than ongoing scrapes. This phase flips the data source automatically + cleanly without breaking the historical view.

## Problem

A client paying us shouldn't be analyzed via the same expensive scraper-based pipeline as a cold prospect. Once Zernio is connected, every dashboard view should pull from Zernio for live data, with the scrape history preserved as a "before we worked together" baseline.

## Primary User

Strategist working day-to-day on a converted client. Editor / shooter referencing client analytics.

## Goals (SMART)

- Per-platform: when Zernio data is available, all live-data views read from Zernio. Otherwise fall through to scrape pipeline (or null state).
- Switchover happens automatically within 24h of Zernio connection.
- Historical prospect-era scrape data remains queryable with a clear "pre-Zernio" label.
- No double-counting in metrics dashboards.

## User Stories

- **US-01** — As a strategist, when a client connects TikTok via Zernio, the analytics page for that client shifts to Zernio data within 24h and shows a "Pre-Zernio data" note for the period before connection.
- **US-02** — As an admin, I can see a clear "data source" indicator on every analytics surface (Zernio / Scrape / Mixed).
- **US-03** — As a developer, a single `getAnalyticsSource(client_id, platform, range)` helper decides which source to read; the rest of the app doesn't have to know.
- **US-04** — As a system, when Zernio token expires or webhook stops, I fall back to scrape data gracefully + alert admin.

## In Scope

- Helper: `lib/analytics/source-router.ts`
  - `resolveAnalyticsSource(client_id, platform, range): 'zernio' | 'scrape' | 'mixed' | 'none'`.
  - Reads from `client_zernio_connections` (existing per the codebase's Zernio integration).
- Data adapters:
  - `lib/analytics/adapters/zernio.ts` (live)
  - `lib/analytics/adapters/scrape.ts` (legacy, sourced from `prospect_monitor_snapshots` + audit history)
  - Both implement the same `AnalyticsAdapter` interface.
- Migration: add `data_source` column to relevant analytics views or aggregates to tag origin.
- UI labels: small pill on every analytics card showing source + last-updated.
- Fallback monitoring: when Zernio fails, alert (push notification) admin to investigate.

## Out of Scope

- Building Zernio analytics from scratch (those are ZNA-01 through ZNA-06).
- Migrating historical scrape data into a "Zernio-shaped" warehouse (keep them separate).
- Per-metric source mixing within a single chart (use one source per visualization).

## Architecture Wiring

- Reuses `client_zernio_connections` table (existing).
- Reuses scrape data from prospect-era tables (preserved by SPY-07 conversion).
- The ZNA-01 cron writes to a Zernio-side analytics table; this layer reads from there.
- Source router is a single import call from every analytics page.

## Open Questions

1. What counts as "Zernio-ready" — token valid + first sync complete, or just token valid? (Default: first sync complete; that's when we have data to show.)
2. When Zernio fails for 24h, do we revert to scrape silently or alert and stay on Zernio (showing stale)? (Default: stale Zernio with a warning banner; don't silently swap.)
3. Should the strategist be able to manually pin a chart to scrape data even when Zernio is available? (Default: no v1 — single source of truth simplifies decisions.)

## Assumptions

- Zernio is the official posting + analytics integration per `MEMORY.md` (`feedback_zernio_not_postara.md`).
- ZNA-01 through ZNA-06 will land before or alongside this PRD.
- Client onboarding includes Zernio connection as a default step.

## Done When

- Source router shipped + tested on 3 client analytics surfaces.
- Real swap-over verified for at least 1 newly-converted client.
- Data-source pill renders on every analytics card.
- Fallback alerting verified by simulating a Zernio token failure.
