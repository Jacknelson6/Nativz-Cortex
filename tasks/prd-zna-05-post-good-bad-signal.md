# PRD: Zernio Analytics, Phase 05 — Per-Post Good/Bad Signal

> Series: Zernio Analytics · 05/06 · Draft 2026-05-10

## Purpose & Value

For each post in the ZNA-04 grid, render a one-glance signal: did this post beat the brand's own average, hit average, or underperform? The signal is computed against the brand's rolling 30-day baseline so it's apples-to-apples, not vs industry averages.

## Problem

A post with 8k views is neutral context-free. For a brand averaging 1k views, it's a hit. For a brand averaging 50k views, it's a miss. Without context, raw view counts mislead. We need a relative signal.

## Primary User

Strategist scanning the post grid. Client noticing wins.

## Goals (SMART)

- Every post in the grid has a signal badge: green (above_avg), neutral (avg), red (below_avg).
- Thresholds defensible: above = >1.3x rolling avg, below = <0.7x rolling avg, else avg.
- Computed lazily on grid load; cached for 24h.
- Engagement rate uses views as denominator (per `MEMORY.md` analytics accuracy fix).

## User Stories

- **US-01** — As a strategist, every post card in the grid has a small colored dot in the corner indicating relative performance.
- **US-02** — As a strategist, hovering the dot shows: "8.4k views (1.7x your TikTok 30-day avg of 4.9k)."
- **US-03** — As a strategist, I can filter the grid to show only "above average" posts to quickly find what's working.
- **US-04** — As a system, posts within their first 48h post-publish don't get a signal yet (they're still climbing) — they get a "Too fresh" indicator.

## In Scope

- Compute function: `lib/analytics/post-signal.ts` exporting `computeSignal(post, baseline_30d) → 'above' | 'avg' | 'below' | 'too_fresh'`.
- Baseline: rolling 30-day average views per platform per client (computed from `platform_snapshots` ZNA-01 OR aggregated post-level).
- Storage: `post_performance_signals` (post_id, signal, ratio, computed_at).
- UI: badge dot on each card in the ZNA-04 grid.
- Filter: "Above average only" toggle.

## Out of Scope

- Industry-wide benchmarking (defer).
- Per-format baselines (e.g. is this comparison-hook video above avg for comparison-hooks specifically?) — stretch.
- Signal for engagement rate specifically (focus on views v1; ER as a hover detail).

## Architecture Wiring

- Reads from `platform_snapshots` for baseline.
- Reads from posts table for per-post metrics.
- Writes to `post_performance_signals`.
- Renders inside `post-grid.tsx` from ZNA-04.

## Open Questions

1. Threshold tuning: 1.3x / 0.7x? (Default: yes — captures clear winners/losers without classifying every post.)
2. Baseline window: 30d, 60d, or 90d? (Default: 30d — catches trend shifts; 90d feels stale.)
3. Recompute signals on a schedule, or just-in-time on grid load? (Default: just-in-time + cache 24h; fewer rows churned.)

## Assumptions

- Strategists + clients understand "above average" framing without needing absolute industry context.
- Rolling 30d is enough for the baseline to stabilize (verify on cold-start brands).
- Filter-by-above-average is the most useful filter; below-average is for review, not celebration.

## Done When

- Signals compute for every post in the ZNA-04 grid for at least 3 clients.
- Filter works.
- Visual QA: badge dots read clearly at card scale, don't crowd the overlay.
- Hover tooltip explains the math transparently.
