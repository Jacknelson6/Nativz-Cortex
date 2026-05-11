# PRD: Zernio Analytics, Phase 03 — AI Insights Pulse (No Bullshit)

> Series: Zernio Analytics · 03/06 · Draft 2026-05-10

## Purpose & Value

A short, surgical AI summary at the top of every client's analytics page. "YouTube is up 18% MoM, IG is flat, TikTok engagement dropped — likely tied to the format shift on April 22." 2-4 sentences. No padding. No posting-time advice. Generated daily after snapshots land.

## Problem

LLM analytics summaries usually devolve into "your account had varied engagement and you should post at optimal times." Useless. We need pulse insights that point at REAL trends and ignore the noise — and we need them to stay short so they're worth reading.

## Primary User

Strategist before a client call. Client glancing at portal.

## Goals (SMART)

- Pulse generated daily for every active client; rendered at top of analytics page.
- Pulse is ≤4 sentences (enforce in prompt).
- ≥70% of pulses judged "useful and accurate" in weekly strategist review.
- Zero pulses about posting times, best days, or generic advice (forbidden topics in prompt).

## User Stories

- **US-01** — As a strategist, I open a client's analytics page and see a top-card pulse summary that surfaces the most important platform delta or trend.
- **US-02** — As a strategist, I can dismiss / regenerate / flag-as-wrong any pulse.
- **US-03** — As a client viewer, I see the same pulse on my portal (read-only).
- **US-04** — As a system, I only generate a pulse when there's meaningful signal — ≥15% week-over-week change or a trend reversal.

## In Scope

- Generator: `lib/analytics/zernio-pulse.ts` exporting `generatePulse(client_id, snapshots) → string`.
- Prompt constraints (banned topics): posting times, best days of week, "post consistently," "engage with your audience," generic platitudes.
- Trigger gate: only generate when `abs(delta_pct) >= 15%` on at least one core metric in last 7 days, OR a trend reversal (was climbing, now declining or vice versa).
- Storage: `client_analytics_pulses` table (id, client_id, generated_at, body text, model, signal_metric, signal_value).
- UI: top card on analytics page, dismiss button, regenerate (admin only).
- Cron: post-snapshot trigger, runs once daily per client after ZNA-01 completes.

## Out of Scope

- Multi-pulse-per-day (one daily insight, max).
- Pulse history view (defer; current pulse only v1).
- Pulse for prospects (only converted clients).

## Architecture Wiring

- Reads from `platform_snapshots` (ZNA-01).
- Reuses OpenRouter client (Claude Sonnet 4.5 per stack).
- Writes to `client_analytics_pulses` (new).
- Renders inline on analytics page (admin + portal).

## Open Questions

1. Single-platform focus or cross-platform synthesis? (Default: cross-platform synthesis — that's where the strategic value is.)
2. Should the pulse reference posts that drove the delta? (Default: yes when high-confidence; falls back to platform-level statements otherwise.)
3. Allow strategists to "lock" a pulse from being overwritten until they've shared it? (Default: yes, lock button.)

## Assumptions

- Claude Sonnet 4.5 is the right model for this size of output (per existing nerd stack).
- Strategists will dismiss bad pulses, providing feedback signal we can use in v2 prompt tuning.
- 15% week-over-week is the right delta threshold (tune from real data after 30 days).

## Done When

- Pulses generate daily for ≥5 clients for 14 consecutive days.
- Strategist signs off on ≥10/14 pulses per client in spot review.
- Zero banned-topic violations.
- Portal version renders cleanly.
