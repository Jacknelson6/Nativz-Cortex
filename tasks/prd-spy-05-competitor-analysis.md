# PRD: Spying → Prospect Pipeline, Phase 05 — Competitor Head-to-Head

> Series: Spying / Prospect Pipeline · 05/10 · Draft 2026-05-10

## Purpose & Value

Second pass: pull 3-5 competitors and benchmark the prospect against them on the same dimensions. The framing flips from "your weak spots" to "here's where you're behind and ahead vs the field" — which is more persuasive on a sales call than abstract grades.

## Problem

A prospect's solo scorecard tells them they're flawed but not by how much. Head-to-head against competitors tells them "you're 40% behind on posting cadence and 60% ahead on engagement quality." That comparative framing is what converts on the call.

## Primary User

Sales rep mid-pitch. Strategist preparing the prospect package.

## Goals (SMART)

- Discover or accept 3-5 competitors within 30s of run start.
- Full competitor scrape + benchmark completes p95 ≤ 4 min (matches current audit budget).
- Head-to-head delta visible across the same 10 checklist dimensions.
- ≥70% of strategist spot-checks rate the competitor picks as "the right ones."

## User Stories

- **US-01** — As a sales rep, after SPY-04 scorecard generates, I see a "Run competitor benchmark" button on the prospect page.
- **US-02** — As a sales rep, I can either accept the system-suggested competitors or paste in my own 1-3 (manual override).
- **US-03** — As a sales rep, the head-to-head view shows the prospect's score next to each competitor for every checklist item, color-coded by who wins.
- **US-04** — As a strategist, the analysis flags "you're behind on N items" and "you're ahead on M items" as the top-line summary.

## In Scope

- Competitor discovery: reuse `lib/audit/discover-competitors.ts` (already battle-tested + recently extended for confirmed socials wiring).
- Confirm-platforms screen: reuse pattern from `components/audit/audit-report.tsx` for prospect-confirmed competitor picks (the work shipped at `2afd2bf4` flows in here).
- Competitor scrape: reuse `scrapeProvidedCompetitors` with the confirmed-socials override path.
- Benchmark grading: extend `lib/prospects/checklist.ts` from SPY-04 to grade competitors on the same scale.
- Head-to-head data model: `prospect_competitor_benchmarks` table joining prospect + competitor + checklist item + score.
- UI: extend prospect detail page (`/admin/prospects/[id]`) with a "vs competitors" tab.

## Out of Scope

- Recurring competitor schedule (SPY-06).
- Competitor video-level analysis (use Format Finder series for that).
- Cross-prospect comparison (later).

## Architecture Wiring

- Reuses the entire competitor discovery + scrape pipeline already shipped for audits.
- New table `prospect_competitor_benchmarks` joining `prospects` + the competitor identifier + checklist scores.
- UI reuses scorecard primitives from SPY-04.
- The recent confirm-socials work (`2afd2bf4`) ensures handpicked competitors don't get re-rediscovered.

## Open Questions

1. Should the competitor benchmark show in the same PDF as the prospect scorecard, or a separate deliverable? (Default: same PDF, "Round 2" section.)
2. Cap competitor count: 3 or 5? (Default: 3, matching audit's current Push C limit.)
3. Industry norms — show benchmark against "average in industry" as a phantom row? (Default: not v1; industry norms data is sparse.)

## Assumptions

- The competitor-discovery LLM picks are good enough out of the gate (Push C tuning landed).
- Scraping a single competitor costs ~$0.30 in Apify credits, so 3 competitors at $0.90 is sales-call ROI-positive.
- The same checklist applies fairly across competitors of similar size.

## Done When

- 10 prospect-vs-competitor benchmarks run end-to-end.
- Head-to-head view ships in `/admin/prospects/[id]`.
- PDF "vs competitors" section renders.
- 7/10 strategist spot-checks call the competitor picks correct.
