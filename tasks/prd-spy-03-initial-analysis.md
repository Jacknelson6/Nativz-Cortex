# PRD: Spying → Prospect Pipeline, Phase 03 — Initial Profile Analysis

> Series: Spying / Prospect Pipeline · 03/10 · Draft 2026-05-10

## Purpose & Value

The first scrape sets the tone. Pull profile picture, bio, last 10-15 captions, top comments, and recent posting cadence — then run a focused analysis that yields actionable observations the prospect didn't pay for. This is the "free value" hook of the sales motion.

## Problem

A full audit takes 4-5 min and analyzes everything. For first-call prospecting, we don't need that depth. We need a fast, targeted read that surfaces 3-5 concrete improvement points within 60s. The existing audit is too heavy AND too slow for this use case.

## Primary User

Sales rep on or just-after a call. Strategist reviewing a prospect cold.

## Goals (SMART)

- End-to-end analysis completes p95 ≤ 90s (under half the full audit duration).
- Cost per prospect run ≤ $0.10.
- Output: 3-5 concrete observations + a single "biggest opportunity" callout.
- ≥80% of strategist spot-checks call the observations "fair and accurate."

## User Stories

- **US-01** — As a sales rep, after SPY-02 onboarding finishes, I see "Running initial scan…" in the prospect record and within ~90s it flips to a clean analysis page with the 5 observations.
- **US-02** — As a strategist, I can open the prospect record and re-run the analysis on demand.
- **US-03** — As a developer, the analysis pipeline is rate-limited per prospect (1 run per 6h) to prevent accidental cost blowouts.

## In Scope

- Pipeline (parallel where possible):
  1. Scrape primary platform profile (TikTok preferred, then IG, then YT). Reuse `lib/audit/scrape-*-profile.ts`.
  2. Scrape profile picture URL; pipe through Gemini Vision for "professional / messy / on-brand" read.
  3. Extract bio + analyze for hook + CTA + handle pattern (LLM).
  4. Pull 10-15 most-recent captions; LLM extracts hook quality, CTA presence, brand voice consistency.
  5. Pull 50 most-recent top-level comments; LLM extracts audience sentiment + recurring themes.
  6. Compute posting cadence (days between last 20 posts).
- Output schema written to `prospect_analyses` (new table) keyed by prospect:
  ```ts
  {
    profile_pic_assessment: { rating: 'good' | 'okay' | 'weak'; note: string };
    bio_assessment: { hook: string | null; cta: string | null; rating: string; note: string };
    caption_pattern: { hook_quality_avg: number; cta_rate: number; voice_note: string };
    comment_signal: { sentiment_score: number; recurring_themes: string[]; reply_rate: number };
    posting_cadence: { posts_per_week: number; trend: 'climbing' | 'flat' | 'declining' };
    observations: string[];  // 3-5 actionable bullets
    biggest_opportunity: string;
  }
  ```
- UI: detail view at `/admin/prospects/[id]` rendering the analysis cleanly with scorecard-style cards.
- Re-run button gated to 1/6h.

## Out of Scope

- Checklist scorecard (SPY-04).
- Competitor analysis (SPY-05).
- Sharing the analysis externally (SPY-09).

## Architecture Wiring

- New file: `lib/prospects/initial-analysis.ts`.
- Reuses Gemini Vision client from existing audit + knowledge work.
- Reuses Apify scrapers (`lib/audit/scrape-*-profile.ts`).
- Writes to `prospect_analyses` (new in this PRD); separate from existing `audit_reports` to keep the data model clean.
- Activity log: `prospect_analyzed` entry on completion.

## Open Questions

1. Which platform is primary? (Default: priority order based on `prospect.primary_platform` if set; else TikTok > IG > YT.)
2. Do we ever analyze multiple platforms in this phase? (Default: just one — the primary. Cross-platform is the full-audit job.)
3. Should observations be auto-translated into a draft email body for the sales rep? (Default: tempting but out of scope; revisit in SPY-09.)

## Assumptions

- Existing scrapers handle profile picture URLs reliably.
- Gemini Vision is cheap enough for one profile-pic call per prospect.
- 50 comments is enough signal for sentiment without blowing cost.

## Done When

- 20 prospects analyzed end-to-end.
- p95 ≤ 90s verified.
- Cost per run verified ≤ $0.10.
- Strategist signs off on 16/20 spot-checks.
- Re-run rate limit enforced.
