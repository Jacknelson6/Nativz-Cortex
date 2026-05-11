# PRD: Viral Format Finder, Phase 04 — Junk Filter (Cheap-Gate Before Deep Analysis)

> Series: Viral Format Finder · 04/10 · Draft 2026-05-10

## Purpose & Value

Gemini Vision analysis is the expensive step. Sending every scraped video into it would burn budget on irrelevant, off-format, or low-quality content. This phase inserts a two-stage cheap gate between sourcing (VFF-03) and analysis (VFF-05) that drops ~60% of incoming videos before they touch the LLM.

## Problem

Of every 100 short-form videos we scrape:
- ~15 are reposts / Stories overflow with no narrative.
- ~10 are ads / promoted content with junk engagement signals.
- ~20 are off-format (over-30s talking heads without short-form treatment).
- ~10 are off-topic for the brand (e.g. cooking content for a SaaS).

That's 55% pure waste. Analyzing them costs money AND pollutes the Netflix rows with noise.

## Primary User

System gate. Strategist benefits indirectly through cleaner format rows.

## Goals (SMART)

- ≥55% rejection rate (logged via `viral_videos.status='rejected'`).
- False-reject rate <5% (spot-check via weekly admin review of 20 rejected videos).
- Cost per rejection ≤ $0.001 (heuristic) or ≤ $0.005 (LLM gate).
- Latency: full gate runs in ≤2s per video.

## User Stories

- **US-01** — As a system, when a `viral_videos` row enters status `pending`, the gate decides within 2s whether to advance it to `analyzing` or mark `rejected` with a reason code.
- **US-02** — As an admin, I can review rejected videos in `/admin/formats/rejected` and reverse a false-reject with one click.
- **US-03** — As a developer, I can see the rejection reason on every dropped row (`viral_videos.reject_reason` text).

## In Scope

- Stage 1 — Heuristic gate (sync, no LLM):
  - Views < 10k → reject `low_views`.
  - Duration > 90s → reject `too_long`.
  - Duration < 5s → reject `too_short`.
  - Engagement rate < 1% AND views < 50k → reject `low_engagement`.
  - Detected ad markers (sponsored tags, paid partnership flags from scraper output) → reject `paid_ad`.
- Stage 2 — LLM gate (cheap model, Haiku or gpt-5.4-mini, caption + first-frame only):
  - "Is this short-form video content with narrative structure? Y/N + 1-line reason."
  - "Is this on-topic for any of these seed terms: [brand seeds]? Y/N."
  - Reject if either is No.
- New column: `viral_videos.reject_reason` text nullable.
- Admin review surface: `/admin/formats/rejected` paginated grid, one-click "Restore."

## Out of Scope

- Re-grading videos previously rejected (manual restore only).
- Per-brand custom heuristics (one global heuristic; brand-specific filtering happens at ranking in VFF-08).
- Tuning the heuristic thresholds via UI (env vars only in v1).

## Architecture Wiring

- New file: `lib/formats/junk-filter.ts` exporting `gateVideo(video, brandSeeds)`.
- Called inline at the end of the sourcing cron job from VFF-03.
- LLM call routed through existing OpenRouter client (`lib/ai/openrouter.ts`).
- Rejection reasons enum lives in `lib/formats/types.ts`.

## Open Questions

1. Do we run the LLM gate per-brand-pair, or once with all seeds combined? (Default: combined; cheaper, slight relevance loss.)
2. Should retention-rate or completion-rate factor in if the scraper exposes it? (Default: yes when available; missing-field-safe.)
3. Engagement-rate denominator — followers or views? (Per `feedback_analytics_brand_pill_only.md`-adjacent rule, ER = engagements / views, not followers. Use that.)

## Assumptions

- Apify outputs include duration + view count + engagement metrics consistently (verify per platform).
- Haiku or gpt-5.4-mini is cheap enough at scale (target $0.005/call).
- A 5% false-reject rate is acceptable in exchange for the volume savings.

## Done When

- Gate runs in production for 7 days.
- Rejection rate verified between 50-65%.
- Admin reviewed 20 rejected videos; false-reject rate ≤5%.
- No latency regressions in the sourcing cron.
