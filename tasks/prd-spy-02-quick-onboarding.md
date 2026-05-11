# PRD: Spying → Prospect Pipeline, Phase 02 — Quick Brand Onboarding

> Series: Spying / Prospect Pipeline · 02/10 · Draft 2026-05-10

## Purpose & Value

The sales call is the moment. Paste a URL, see a fully-formed prospect record in under 30 seconds, with socials detected, basic profile data, and a placeholder for the initial audit to fire next. This phase optimizes pure time-to-value.

## Problem

Today, creating an audit takes 90-120s (full scrape + analysis). On a live sales call, that's an awkward silence. We need a sub-30s "skeleton onboard" that returns enough to start the conversation while heavier analysis runs in the background.

## Primary User

Sales rep / strategist on a live call. Secondary: internal team adding prospects asynchronously.

## Goals (SMART)

- Time from URL paste to prospect record visible in UI: p50 ≤ 15s, p95 ≤ 30s.
- Auto-detected platforms appear in ≥85% of cases (URL-paste-only — no manual input round-trip).
- Initial audit kicks off automatically and reports back via toast within 120s.
- Failed-detection states show clear retry path (no dead ends).

## User Stories

- **US-01** — As a sales rep, I paste a brand's website URL into `/admin/prospects/new`, click Go, and see a prospect record render with brand name, favicon, and detected social handles in <30s.
- **US-02** — As a sales rep, when the system detects social handles, they appear as confirmable badges (green = high confidence, yellow = needs picking from options).
- **US-03** — As a sales rep, I can override a wrong auto-detection inline without losing my place.
- **US-04** — As a system, the initial profile analysis (SPY-03) auto-kicks once detection is complete.

## In Scope

- Route: `app/admin/prospects/new/page.tsx`.
- API endpoint: `POST /api/prospects/onboard` accepts URL, returns prospect record + detection results.
- Detection pipeline (reuse existing audit scrapers):
  - Site scrape via `lib/audit/scrape-website.ts` for socials + brand metadata.
  - Disambiguation via `lib/audit/search-competitor-socials.ts` for ambiguous handles.
  - Returns a confirmation payload mirroring the audit confirm-platforms screen pattern.
- Inline confirm UI on the prospect record page (no full-page redirect; reuse pattern from `components/audit/audit-report.tsx` confirm screen).
- Auto-fire of SPY-03 initial analysis once detection is confirmed.

## Out of Scope

- The analysis itself (SPY-03).
- The PDF deliverable from analysis (SPY-04).
- Bulk onboarding from CSV (later).

## Architecture Wiring

- Reuses existing scrapers (`lib/audit/scrape-website.ts`, `lib/audit/search-competitor-socials.ts`).
- Reuses confirm-platforms component pattern from `components/audit/audit-report.tsx`.
- Writes to `prospects` + `prospect_socials` from SPY-01.
- Activity log entry on every onboard: `prospect_onboarded`.

## Open Questions

1. If URL is a social profile (TikTok handle vs website), do we accept that as the seed? (Default: yes — detect URL kind and route accordingly.)
2. Should we run the initial audit synchronously inside the onboard call, or kick async? (Default: async with toast — keeps onboard <30s.)
3. Failed website scrape — block onboard, or save prospect with empty socials? (Default: save with empty socials + flag for manual entry.)

## Assumptions

- The existing website scraper handles the long tail (Squarespace, Shopify, custom CMS) — verified by recent audit work.
- Social detection has already improved enough through the audit Push C work to be relied on.
- Sales rep is on a 14"+ laptop screen, not mobile.

## Done When

- 10 different brands onboarded successfully end-to-end.
- p95 time-to-record verified ≤ 30s.
- Inline confirm + override path verified.
- Auto-fire of SPY-03 initial analysis confirmed working.
