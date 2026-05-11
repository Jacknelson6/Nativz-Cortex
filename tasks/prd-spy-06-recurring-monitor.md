# PRD: Spying → Prospect Pipeline, Phase 06 — Recurring Competitor Monitor

> Series: Spying / Prospect Pipeline · 06/10 · Draft 2026-05-10

## Purpose & Value

A one-time benchmark is a sales tool; a recurring monitor is a relationship. Scheduled weekly competitor scrapes feed a delta-tracker that surfaces "your competitor just hit X" alerts — keeping the prospect warm post-demo and giving the sales rep a recurring reason to reach back out.

## Problem

After the first sales call, prospects go cold. Without a reason to re-engage, the relationship dies in 14 days. A weekly competitor pulse keeps the prospect record alive and gives the sales rep a non-pushy touchpoint ("noticed your competitor X just shifted to Reels-heavy content").

## Primary User

Sales rep (consumes alerts). Strategist (curates scheduling).

## Goals (SMART)

- Cron schedule reliably fires weekly per prospect, with ≥99% success rate.
- Delta detection latency: alert in admin UI within 1h of scrape completing.
- Alert relevance: ≥60% of fired alerts judged "worth surfacing" in weekly strategist review (false-positive ≤40%).
- Cost per prospect per month ≤ $2 (4 weekly runs at <$0.50 each).

## User Stories

- **US-01** — As a strategist, I can toggle "Monitor weekly" on a prospect record and pick a day of the week.
- **US-02** — As a sales rep, I see an "Activity" panel on the prospect record with timestamped alerts: "Competitor X gained 12k followers this week," "Competitor Y posted a viral video (380k views) — far above their baseline."
- **US-03** — As an admin, I can pause or cancel monitoring per prospect.
- **US-04** — As a system, when a meaningful delta fires, I write an alert row + notify the prospect's owner (push notification if Remote Control is on).

## In Scope

- Scheduling layer: **Vercel Workflow DevKit** is the durable substrate here. This is the one place in this series where workflow patterns matter:
  - Each prospect has a `DurableAgent` instance scheduled weekly.
  - Workflow survives function crashes, retries failed scrapes, and resumes on cold start.
  - Per `docs/spec-vercel-workflow-migration.md`-aligned guidance.
- Tables:
  - `prospect_monitor_config` (prospect_id, frequency, day_of_week, active, paused_at).
  - `prospect_monitor_snapshots` (id, prospect_id, captured_at, competitor_id, raw_metrics jsonb).
  - `prospect_monitor_alerts` (id, prospect_id, kind enum: `follower_jump` | `viral_post` | `cadence_shift` | `format_pivot`, message text, evidence_snapshot_id, severity enum).
- Delta detection (deterministic):
  - Follower jump: ≥10% week-over-week.
  - Viral post: top-1 post views ≥5x competitor's 30-day average.
  - Cadence shift: posting frequency changes ≥50%.
  - Format pivot: detected when ≥3 of last 5 posts shift archetype.
- UI: alert feed on prospect detail page + filterable "All alerts" view.
- Notifications: push to owner_user_id when severity = high.

## Out of Scope

- LLM-narrated alerts ("here's why this matters") — comes in v2 as an AI summary on top.
- Sentiment alerts (comment sentiment shifts) — stretch.
- Cross-prospect industry trends — bigger surface.

## Architecture Wiring

- Workflow DevKit for the scheduled durable runs (this is its actual use case).
- Reuses `scrapeProvidedCompetitors` + scrapers already established.
- Builds on `prospect_competitor_benchmarks` from SPY-05 to compute deltas.
- Push notifications via existing PushNotification flow (per Remote Control rule in CLAUDE.md).

## Open Questions

1. Should the monitor also re-scrape the prospect themselves, or competitors only? (Default: competitors only — prospects are static until conversion.)
2. Frequency options: weekly only, or weekly/biweekly/monthly? (Default: weekly/biweekly v1; daily reserved for after-conversion.)
3. Severity threshold tuning — UI exposed or env-only? (Default: env v1, UI when we have enough data to know correct defaults.)

## Assumptions

- Vercel Workflow DevKit is the right substrate for durable scheduled runs (per injected workflow context guidance).
- Strategists can absorb ~5-10 alerts/week per prospect without alert fatigue.
- Apify cost stays linear; we're not 100x'ing volume.

## Done When

- Workflow scheduled + verified firing weekly for 2 consecutive weeks.
- Alerts surface in admin UI.
- Push notifications fire on high-severity alerts.
- Cost per prospect per month verified ≤ $2.
