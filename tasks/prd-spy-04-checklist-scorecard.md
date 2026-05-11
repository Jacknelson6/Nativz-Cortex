# PRD: Spying → Prospect Pipeline, Phase 04 — Audit Checklist & Free-Value PDF

> Series: Spying / Prospect Pipeline · 04/10 · Draft 2026-05-10

## Purpose & Value

Convert SPY-03's analysis into a deliverable. A fixed 8-10 item checklist that grades each prospect against the same criteria, produces a "this could use improvement / this could use improvement / this is great" PDF, and lands as a branded asset the sales rep can leave behind. Standardized = scalable = sales-ready.

## Problem

Custom narrative reports take strategist time and feel inconsistent. A fixed checklist with R/Y/G grading is fast, comparable across prospects, and gives the prospect a tangible "free value" deliverable that builds trust on a sales call.

## Primary User

Sales rep handing off a deliverable. Prospect (one-way recipient).

## Goals (SMART)

- PDF generates in ≤10s from a completed analysis.
- 100% of items on the checklist score deterministically given the SPY-03 output (no LLM in the rendering loop).
- Branded PDF matches `project_branded_pdfs.md` standard.
- Sales rep can email or share the link in <30s.

## User Stories

- **US-01** — As a sales rep, after SPY-03 analysis completes, I see a "Generate scorecard PDF" button on the prospect page.
- **US-02** — As a sales rep, the generated PDF has the prospect's brand on the cover, a one-page summary scorecard, and a 1-page-per-item breakdown for any item scoring "improvement needed."
- **US-03** — As a sales rep, I can copy a public share link (`/shared/prospect/[token]`) for the scorecard.
- **US-04** — As a strategist, I can override an auto-graded item if the LLM was wrong before generating the PDF.

## In Scope

- Checklist definition (8-10 items, in priority order):
  1. Bio is optimized (hook + CTA + handle pattern).
  2. Profile picture is professional + recognizable.
  3. Posting cadence is consistent (>=3/wk).
  4. Captions hook in the first line.
  5. Captions include CTAs ≥30% of the time.
  6. Comments are responded to (≥20% reply rate).
  7. Hashtag strategy is present (not absent, not stuffed).
  8. Content has variety (≥3 distinct formats across recent posts).
  9. Profile drives clicks (link in bio, clear next step).
  10. Voice is brand-consistent across posts.
- Auto-grading: deterministic rules in `lib/prospects/checklist.ts` mapping SPY-03 fields to R/Y/G.
- Override UI: per-item override + manual note before PDF generation.
- PDF template: extend `lib/pdf/branded/` with `mapProspectScorecardToBranded` adapter.
- Share link: extend existing share-link pattern (per `audit_share_links` migration).

## Out of Scope

- Custom rubrics per industry (one global rubric v1).
- Embedded video clips in the PDF (defer).
- Auto-emailing the PDF to the prospect (manual share v1).

## Architecture Wiring

- Grading: pure function in `lib/prospects/checklist.ts` (testable, no side effects).
- PDF: new adapter in `lib/pdf/branded/adapters.ts` (one of the 11 templates from the migrate-templates todo).
- Share token: new table `prospect_share_links` (mirror `audit_share_links`).
- Public route: `app/shared/prospect/[token]/page.tsx` server-renders the report read-only.

## Open Questions

1. Should overall score be a number (e.g. 7/10) or just an item-by-item breakdown? (Default: no overall number — number invites argument; checklist invites action.)
2. Allow the prospect to share / comment on the PDF? (Default: no, one-way for v1.)
3. Cap the share link with expiry? (Default: 90 days, like `feedback_share_link_expiry.md`-adjacent norms.)

## Assumptions

- Branded PDF infrastructure (`lib/pdf/branded/`) is stable enough to add another adapter without surgery.
- Deterministic grading is preferable to LLM-graded for legal-defensibility and consistency.
- Strategist override is rare (<20%) but high-value when needed.

## Done When

- 5 different prospect scorecards generated.
- Share link verified accessible without login.
- Visual QA: PDF matches existing branded template density + tone.
- Override path verified.
