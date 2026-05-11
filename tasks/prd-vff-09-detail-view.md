# PRD: Viral Format Finder, Phase 09 — Expanded Detail View

> Series: Viral Format Finder · 09/10 · Draft 2026-05-10

## Purpose & Value

Clicking a card opens the full reasoning: hook breakdown, structure beats, why it works, retention pattern, and the "use this format" CTA that hands off to Content Lab (VFF-10). This is where intelligence becomes action.

## Problem

A card is a hook; the detail view is the payoff. Without it, the format library is decorative. With it, the strategist can copy a structure into a script in seconds.

## Primary User

Strategist mid-research. Secondary: editor / shooter referencing the structure.

## Goals (SMART)

- Time-from-click-to-fully-rendered ≤ 600ms (existing data, no network re-fetch when clicked from a card already in memory).
- "Use this format" CTA fires successfully in ≥95% of attempts (handoff to Content Lab works).
- Save / Pin action persists ≤200ms.
- Strategist can read the entire breakdown without horizontal scrolling at 1280px+.

## User Stories

- **US-01** — As a strategist, clicking a card opens a side modal with video preview (autoplay muted) on the left and structured analysis on the right.
- **US-02** — As a strategist, the right pane shows: hook breakdown (timestamped beats for the first 5s), structure beats (3-7 bullet points), why it works (2-3 sentences), retention pattern (one-line shape: "tension-release-payoff"), source link to original platform.
- **US-03** — As a strategist, I can click "Use this format" and land in Content Lab with the format pre-loaded as a scripting template scoped to the current brand.
- **US-04** — As a strategist, I can save the video to a personal collection or pin to the brand's library.
- **US-05** — As a strategist, I can mark "Not for this brand" — the row recomputes and demotes this video next time.

## In Scope

- Route: `app/admin/formats/[id]/page.tsx` + parallel route for modal overlay from the grid.
- Components:
  - `components/formats/format-detail-pane.tsx` — right-pane content with all analysis fields.
  - `components/formats/format-video-preview.tsx` — autoplay-muted MP4 / fallback to platform iframe.
  - Action buttons: "Use this format" (primary), "Save to brand library," "Pin," "Not for this brand."
- Action persistence:
  - Save → `viral_collection_videos` insert into a per-user "Saved" collection.
  - Pin → `viral_collection_videos` insert into the brand's pinned collection.
  - Not-for-this-brand → `viral_video_brand_dismissals` row that feeds VFF-08 ranking.
- Source link: opens original TikTok / IG / YT URL in new tab.

## Out of Scope

- Comments on the format itself (defer to a v2 social layer).
- Editing the LLM's analysis output (strategists can flag, not edit).
- Bulk action across multiple videos (one-at-a-time v1).

## Architecture Wiring

- Modal pattern: Next.js parallel routes (`@modal/(.)formats/[id]`).
- Video preview: leans on existing Mux storage for legacy or direct platform iframe for source content (per `feedback_video_storage_on_mux.md`).
- "Use this format" handoff: POSTs a templated prompt to `/api/content-lab/conversations` with the format slug + analysis data as system-prompt seed.
- Dismissal table feeds back into the brand ranker in VFF-08.

## Open Questions

1. Should "Use this format" actually pre-seed a script draft, or just open Content Lab with the format pinned? (Default: pin to context, let user prompt — feels less prescriptive.)
2. Display top comments alongside the analysis? (Default: yes, top 5, in a collapsible "Audience reaction" section.)
3. Show competitor-source flag when relevant? (Default: yes — small "Pulled from your competitor: Brand X" line.)

## Assumptions

- Video preview from platform embed is reliable enough for v1 (no MP4 re-host).
- Strategists trust the analysis enough to use it directly; if not, dismissal feedback loop will tune ranking.
- Modal pattern + URL state keeps deep-linking working (`/admin/formats/abc123` opens detail directly).

## Done When

- Detail view renders end-to-end with real data.
- "Use this format" handoff successfully opens Content Lab with format context.
- Save / pin / dismiss actions all persist + reflect in rankings.
- Visual QA matches sibling detail surfaces (e.g. audit report detail panel).
