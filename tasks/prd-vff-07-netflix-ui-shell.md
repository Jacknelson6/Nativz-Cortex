# PRD: Viral Format Finder, Phase 07 — Netflix-Style UI Shell

> Series: Viral Format Finder · 07/10 · Draft 2026-05-10

## Purpose & Value

Build the surface. A hero spotlight at top, horizontal-scrolling rows below, dark theme, snappy. This is the moment Format Finder stops being a database and starts being a product the strategist actually opens.

## Problem

A list view of videos is what we already have in `/spying/watch`. The Netflix layout matters because it implies curation: "These rows were chosen for YOU and THIS BRAND." It signals editorial judgment, not search results.

## Primary User

Internal strategists. This is the surface they live in for 10-30 min/day.

## Goals (SMART)

- First Paint < 1.5s on a brand with 200+ analyzed videos.
- Horizontal scroll snaps to card boundaries on touch + wheel.
- Zero "looks like a different app" complaints — must match `.impeccable.md` + admin shell tokens.
- 8+ distinct row strategies render correctly with empty-state fallback.

## User Stories

- **US-01** — As a strategist, I open `/admin/formats?brand=nike` and see a hero card (top pick) + 6-10 rows of formats organized by collection.
- **US-02** — As a strategist, I can horizontally scroll a row with trackpad, wheel, or arrow buttons, and the cards snap.
- **US-03** — As a strategist, switching brand via the top bar pill reorders + refilters rows immediately (no full page reload).
- **US-04** — As a strategist on a smaller laptop screen, the rows still feel correctly sized and don't crowd.

## In Scope

- Layout components:
  - `components/formats/format-hero.tsx` — full-width spotlight at top, autoplay-on-hover preview.
  - `components/formats/format-row.tsx` — horizontal lane with snap, scroll buttons (chevrons), lazy-load on horizontal scroll.
  - `components/formats/format-grid.tsx` — page-level composer that stacks hero + rows.
- Row strategies (data sources):
  1. **For You (Brand-aware mix)** — top 10 by cosine similarity to brand seeds, mixed dimensions.
  2. **Trending in your niche** — top by 7-day view velocity within seed terms.
  3. **Top hooks this week** — grouped by hook_type, one row per top-3 hook types.
  4. **Comparison hooks** — filtered by hook_type='comparison_hook'.
  5. **POV stories** — filtered by structure='pov_story'.
  6. **Worth stealing from competitors** — videos sourced from brand's confirmed competitors (cross-references SPY-05).
  7. **Recently analyzed** — newest 20.
  8. **Saved / pinned** — manual save list (introduced in VFF-09).
- Brand pill in header — reuses existing `components/layout/brand-pill.tsx` or equivalent.
- Dark theme tokens, Poppins/Rubik per agency (per `project_branded_pdfs.md`).
- Loading skeletons for each row.
- Empty state per row: "No videos match this slice yet — check back tomorrow."

## Out of Scope

- The 9:16 card itself (VFF-08).
- The expanded detail view (VFF-09).
- Mobile portal experience (admin desktop-first; portal is VFF-10 decision).

## Architecture Wiring

- Page: `app/admin/formats/page.tsx` (replaces empty shell from VFF-01).
- Data layer: `app/api/formats/feed/route.ts` returning row payloads in a single batched request.
- Brand pill state: persists to localStorage like `research-hub.tsx:43-73` does.
- Reuses `IconCard` design system from memory note `project_section_card_design_system`.

## Open Questions

1. Hero card — auto-play with sound off, or play on hover only? (Default: play on hover, sound off; matches Netflix.)
2. Row count cap — 8 or 12? (Default: 10. More than that, page feels infinite-scroll-y.)
3. How do we handle a brand that has zero analyzed videos yet? (Default: show "Generic For You" rows + a clear "Seeding your brand library — check back in 24h" banner.)

## Assumptions

- Strategists open this on a 14"+ laptop primarily.
- Backend can return 10 rows × 12 videos × ~30 fields each in < 800ms (verify on first build).
- Horizontal scroll with snap is familiar enough that no onboarding tooltip is needed.

## Done When

- All 8 row strategies render with real data on at least one brand.
- p95 first-paint ≤ 1.5s measured via Vercel speed-insights.
- Visual QA pass: matches admin shell density, typography, button styles.
