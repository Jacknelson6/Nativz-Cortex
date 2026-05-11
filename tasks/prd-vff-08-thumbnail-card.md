# PRD: Viral Format Finder, Phase 08 — 9:16 Thumbnail Card

> Series: Viral Format Finder · 08/10 · Draft 2026-05-10

## Purpose & Value

The atomic UI unit. Every row in VFF-07 is a sequence of these. The card has to communicate format type, engagement angle, and brand fit in a single glance, while staying 9:16 so it visually reads as "short-form video."

## Problem

Generic 16:9 thumbnails fail twice: they don't reflect the actual content shape (TikTok / Reels / Shorts are vertical), and they leave too much horizontal real estate for filler. A 9:16 card forces sharper hierarchy and feels native to the format being shown.

## Primary User

Internal strategist scanning a row.

## Goals (SMART)

- Card render < 30ms (no layout shift, image fetched eagerly within viewport).
- 100% of cards show a real thumbnail OR a platform-tinted fallback. No grey eye tiles, no broken images (per `feedback_audit_report_redesign.md` carry-over).
- Glance test: a strategist can identify hook type + format archetype within 1.5s of seeing the card (informal QA).
- Card width tunes nicely between 160-220px depending on row context.

## User Stories

- **US-01** — As a strategist, every card shows a 9:16 thumbnail with an overlay that reads: format tag (small pill, top-left), bold title (1-2 lines, bottom), engagement-hook descriptor (subtitle one-liner, bottom).
- **US-02** — As a strategist, hovering the card surfaces a brand-relevance pill (high / medium / low) and lifts the card slightly.
- **US-03** — As a strategist, clicking the card opens the detail view (VFF-09) with no page reload (modal route).
- **US-04** — As a strategist, a card with no thumbnail (rare) renders a platform-tinted block with the platform mark + the title overlay still legible.

## In Scope

- `components/formats/format-card.tsx`:
  - Aspect ratio fixed at 9:16 via aspect-ratio CSS.
  - Image: lazy-loaded, Supabase Storage URL persisted via VFF-03 pipeline.
  - Overlay layers (bottom-up gradient):
    - Format pill (top-left): hook_type slug rendered as short label, e.g. "Comparison."
    - Title (bold, 14px, white, 1-2 lines max with ellipsis).
    - Engagement hook descriptor (12px, neutral-200, one line, ellipsis).
    - Hover-only: brand-relevance pill bottom-right.
  - Hover: subtle scale-up (1.04) + accent-text border glow.
- Fallback path: when thumbnail URL is null, render `bg-platform-{tiktok|instagram|youtube}` block with logomark centered, overlay still applies.
- Click handler: routes to `/admin/formats/[id]` via intercepting modal (Next.js parallel routes).

## Out of Scope

- The detail view content (VFF-09).
- Mobile-optimized card sizing (admin is desktop-first).
- Drag-to-reorder cards (would belong to a manual collection editor; later).

## Architecture Wiring

- Sits inside `format-row.tsx` from VFF-07.
- Thumbnail URLs read from `viral_videos.thumbnail_storage_url` (persisted in VFF-03).
- Format pill label resolves slug → human label via `viral_formats.label`.
- Engagement-hook descriptor pulled from `viral_videos.analysis_data.engagement_hook_descriptor`.
- Reuses existing platform color tokens from `lib/branding/`.

## Open Questions

1. Should the title come from the actual video title/caption, or from the LLM's why_it_works summary? (Default: take the first line of caption if ≤60 chars, else fall back to LLM-summarized hook line.)
2. Brand-relevance pill — show always, or hover-only? (Default: hover-only to reduce visual noise; pill is a power-user reveal.)
3. Pill placement when content is busy at top? (Default: pin to top-left consistently; the overlay gradient handles legibility.)

## Assumptions

- 9:16 cards at ~180px wide leave room for 5-6 cards per row on a 14" screen.
- Strategists can read 12px subtitle reliably (verify in visual QA).
- LLM-generated descriptors stay ≤80 chars (enforce in VFF-05 analysis schema).

## Done When

- Cards render with real data across all 8 rows.
- Zero broken images verified after 24h.
- Visual QA pass: density, hierarchy, no font-stack regressions.
- Glance test passes informal review with at least 2 strategists.
