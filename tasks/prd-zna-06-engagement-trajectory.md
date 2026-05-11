# PRD: Zernio Analytics, Phase 06 — Per-Post Engagement Trajectory

> Series: Zernio Analytics · 06/06 · Draft 2026-05-10

## Purpose & Value

A post's first 7 days tells the strategist whether it's still climbing, peaked, or already dead. This phase adds a mini-trajectory sparkline to each post card and a status pill: `still_climbing` / `peaked` / `declining` / `dead`. Helps strategists know when to amplify (still climbing) vs when to learn from the post and move on.

## Problem

The good/bad signal (ZNA-05) is a single moment in time. A post that's at 1.7x average TODAY could either be still climbing (boost it) or already past peak (don't pour gas on a cooling fire). Without the trajectory, strategy on the post is guessing.

## Primary User

Strategist deciding whether to repurpose / boost / archive a post. Editor learning what shape "winning" looks like at 7d.

## Goals (SMART)

- Every post ≥48h old has a trajectory sparkline + status pill.
- Sparkline reads at card scale (no extra click).
- Trajectory data updates every 6h for posts <14 days old; daily for posts 14-30 days; archived after 30 days.
- Status classification ≥85% accurate by strategist spot check.

## User Stories

- **US-01** — As a strategist, every post card in the ZNA-04 grid shows a 7-day view sparkline overlaid below the headline metric.
- **US-02** — As a strategist, I see a status pill on each card: still_climbing (green arrow up) / peaked (neutral) / declining (yellow) / dead (grey).
- **US-03** — As a strategist, I can filter the grid by status (e.g. "show me still-climbing posts").
- **US-04** — As a system, I track view counts at 1h, 6h, 24h, 48h, 72h, then daily post-publish for 30 days; archive after that.

## In Scope

- New table `post_metric_timepoints` (post_id, captured_at, views, likes, comments, shares).
- Sampling cron:
  - For each post: schedule timepoints at the cadence above based on age.
  - Implement as a Vercel Workflow durable agent OR a daily fan-out cron that schedules the next sample.
- Status classifier: `lib/analytics/trajectory.ts` exporting `classifyTrajectory(timepoints) → status`.
  - Heuristic: last-24h-views vs prior-24h-views ratio + age. (Tunable, deterministic, no LLM.)
- UI:
  - Sparkline in `post-grid.tsx` card, bottom edge.
  - Status pill on hover overlay or persistent corner badge.
  - Filter pill row above the grid.

## Out of Scope

- Real-time updates within the UI (poll on page focus is fine).
- Per-status recommendations ("post that's still climbing → boost spend") — that's a future automation layer.
- Trajectory for engagement rate specifically (focus on views v1).

## Architecture Wiring

- Sampling: extend ZNA-01 cron OR add separate `app/api/cron/post-timepoints/route.ts`.
- Status math lives in pure function for testability.
- Renders inline on ZNA-04 cards.
- Workflow DevKit useful here for per-post scheduling, but not required — daily fan-out cron is simpler.

## Open Questions

1. Workflow DevKit per post (durable, retries on failure) vs daily fan-out cron (simpler)? (Default: daily fan-out v1; Workflow if we hit reliability issues.)
2. Should "dead" trigger any auto-action (e.g. archive)? (Default: no, just classify; humans decide.)
3. Sparkline color: trajectory-aware or neutral? (Default: trajectory-aware — green up, yellow down, grey flat.)

## Assumptions

- Zernio API supports per-post metric polling at the cadence we need without rate limiting (verify).
- Strategists will find the trajectory more valuable than additional precision (e.g. minute-by-minute).
- 30-day retention on per-post timepoints is sufficient; we can downsample older data into ZNA-01 daily snapshots.

## Done When

- Trajectories compute for 90+ posts across multiple clients.
- Sparkline + status pill render at card scale legibly.
- Filter pills work.
- Strategist spot-check confirms ≥85% accuracy on classification.
- This PRD ships, the entire ZNA series is done.
