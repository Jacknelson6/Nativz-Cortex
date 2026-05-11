# PRD: Spying → Prospect Pipeline, Phase 09 — Sales Call Presentation Mode

> Series: Spying / Prospect Pipeline · 09/10 · Draft 2026-05-10

## Purpose & Value

The same prospect data, optimized for screen-share. A dark, large-type, single-focus surface that walks the prospect through their scorecard → competitor benchmark → opportunity → next step. No nav chrome, no dev fonts, no admin gridlines. Pure conversation tool.

## Problem

The current prospect detail page is built for the strategist — dense, multi-pane, optimized for inspection. On a screen-share with a prospect on Zoom, dense + multi-pane reads as cluttered and amateur. We need a presentation skin that flips the same data into a confident, theatrical view.

## Primary User

Sales rep mid-call, screen-sharing. The prospect, watching.

## Goals (SMART)

- Presentation mode loads from existing prospect data in <1s (no extra fetches).
- Large-type readable at 1080p Zoom call (min 24px body, 48px+ headings).
- Hotkey-driven (arrow keys advance) so the rep doesn't fumble.
- Optional public token mode: the same view shareable as a link the prospect can rewatch.

## User Stories

- **US-01** — As a sales rep, from any prospect detail page, I press "Present" or hit `P` and the screen transitions to fullscreen presentation mode.
- **US-02** — As a sales rep, arrow keys advance / rewind through the panel sequence: cover → current-state scorecard → competitor benchmark → biggest opportunity → 30-day improvement plan → next step CTA.
- **US-03** — As a sales rep, I can copy a public link (`/present/[token]`) so the prospect can rewatch the deck later.
- **US-04** — As a prospect on a watching the public link, I see the same flow with no nav, with optional download of the scorecard PDF from SPY-04.

## In Scope

- Route: `app/admin/prospects/[id]/present/page.tsx` (internal).
- Public route: `app/present/[token]/page.tsx` (shareable).
- Panels in sequence:
  1. **Cover** — brand logo + "Audit prepared for [Brand Name]" + date.
  2. **Current state** — scorecard from SPY-04, large type, R/Y/G dots.
  3. **Vs competitors** — head-to-head from SPY-05, prospect vs competitor scores in big numbers.
  4. **Biggest opportunity** — single bold callout from SPY-03.
  5. **30-day plan** — 3 concrete action items pulled from the checklist items scored "improvement."
  6. **Next step** — "Schedule a strategy session" CTA + sales rep contact.
- Hotkey nav (left/right arrows, Esc).
- Optional autoplay (configurable delay).
- Dark theme by default; no admin chrome.

## Out of Scope

- Live editing during the call (read-only at presentation time).
- Annotations / drawing tools (defer).
- Per-panel custom theming per prospect (one theme v1).

## Architecture Wiring

- Reads from existing SPY-04 + SPY-05 data.
- Public token: extend `prospect_share_links` from SPY-04.
- New page layout independent of the admin shell (no sidebar).
- Reuses branded PDF logo asset paths (per `project_branded_pdfs.md`).

## Open Questions

1. Should the 30-day plan be LLM-generated or strategist-edited? (Default: LLM-drafted + strategist-edited before the call — locks the version.)
2. Public link expiry? (Default: 30 days post-call.)
3. Allow the public link to convert to a "lead capture" form? (Default: yes — small "Want a deeper analysis?" CTA at the bottom; submits to the sales rep.)

## Assumptions

- The sales rep wants to control pacing manually (arrow keys), not autoplay.
- Prospects appreciate the deliverable enough to revisit the link.
- Branding stays Nativz / AC; no per-prospect white-labeling v1.

## Done When

- Internal present mode renders + key-navigates cleanly.
- Public link verified accessible.
- Visual QA: typography + density read well at 1080p screen-share.
- Sales rep runs at least one real demo using it.
