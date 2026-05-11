# PRD: Zernio Analytics, Phase 02 — Per-Platform Growth Line Charts

> Series: Zernio Analytics · 02/06 · Draft 2026-05-10

## Purpose & Value

Read the snapshots from ZNA-01 and render them as clean, daily line charts per platform. The chart answers "is this account growing, flat, or declining?" at a glance. High-level. No noise.

## Problem

Existing analytics surfaces are dashboards full of small numbers without trajectory. Clients want to see the line — up = good, down = problem. A trajectory is more meaningful than a single-day count, especially when prepared for a quarterly review.

## Primary User

Strategist preparing client reviews. Client viewing their own portal.

## Goals (SMART)

- Chart loads in <500ms on a brand with 90 days of snapshots.
- Date range toggle: 7d / 30d / 90d / All (defaults to 30d).
- Three line metrics per platform: Followers, Total views (rolling 7d), Engagements (rolling 7d).
- No "posting times" widget, no "best day of week" — keep it focused.

## User Stories

- **US-01** — As a strategist, on the analytics page I see one chart per connected platform with three lines (followers / views / engagements).
- **US-02** — As a strategist, I can toggle date range and the lines update without page reload.
- **US-03** — As a client viewer, on my portal I see the same charts (scoped to my organization).
- **US-04** — As a strategist, I see a delta callout next to each chart (e.g. "+18% followers vs prior 30 days").

## In Scope

- Page: `/admin/analytics/zernio?clientId=X` (or co-locate in existing analytics route).
- Portal page: `/portal/analytics` scoped via `getPortalClient()`.
- Components:
  - `components/analytics/zernio-growth-chart.tsx` — Recharts line chart with three series.
  - `components/analytics/zernio-delta-callout.tsx` — small card with percentage delta + sparkline.
  - Date range toggle component.
- Data layer: `/api/analytics/zernio/timeseries?client_id=X&platform=Y&range=Z` — reads `platform_snapshots`, transforms to chart-ready shape.
- Delta math: compare last-N-days mean to prior-N-days mean; suppress when prior period is sparse (per `MEMORY.md` note on analytics accuracy pass).
- Empty state when no data: "Connect Zernio to see growth charts."

## Out of Scope

- LLM insights summary (ZNA-03).
- Per-post grid (ZNA-04).
- Cross-platform combined view (one chart per platform v1).

## Architecture Wiring

- Reuses `platform_snapshots` from ZNA-01.
- Reuses Recharts (existing).
- Source-router from SPY-08 ensures we're reading Zernio data, not scrape data, for converted clients.
- Portal version uses `getPortalClient()` for organization scoping (CLAUDE.md hard rule).

## Open Questions

1. Should "engagements" be likes + comments + shares, or include saves? (Default: likes + comments + shares; saves vary in support across platforms.)
2. Show engagement-rate (ER) as a secondary chart, or omit? (Default: omit on this view; ZNA-05 surfaces ER per-post.)
3. Y-axis: linear or log? (Default: linear; log makes 50→100 look the same as 10k→20k and confuses clients.)

## Assumptions

- 90 days of snapshots is sufficient retention to feel substantive.
- Strategists + clients prefer "is the line going up" over "what's the exact number" for trend questions.
- Recharts is fast enough for daily-granularity lines with up to 90 points.

## Done When

- Charts render across all connected platforms for at least 3 clients.
- Date range toggle works.
- Delta callouts compute correctly + suppress on sparse prior windows.
- Portal version verified org-scoped + read-only.
- Visual QA: matches existing analytics density, no leftover "best time" widgets.
