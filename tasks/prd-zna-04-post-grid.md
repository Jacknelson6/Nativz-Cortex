# PRD: Zernio Analytics, Phase 04 — Individual Post Grid with Reliable Thumbnails

> Series: Zernio Analytics · 04/06 · Draft 2026-05-10

## Purpose & Value

Per-post performance, in a grid the client can scan. Each post has its real thumbnail (rendered, not broken), platform marker, posted-at, and headline metric. Thumbnails MUST render — this is the single biggest "looks unprofessional" failure mode of existing analytics surfaces.

## Problem

Existing post grids show grey placeholder tiles half the time because Zernio's thumbnail URLs expire or get rate-limited. A grid of broken images is worse than no grid. We need a persistence layer that copies thumbnails to Supabase Storage at sync time and serves them from there, surviving any CDN expiry.

## Primary User

Strategist reviewing recent posts. Client browsing their own feed equivalent.

## Goals (SMART)

- 100% of posts in the grid have a working thumbnail (real image OR platform-tinted fallback with brand mark, never grey eye tiles).
- Thumbnail persistence: when a post syncs from Zernio, thumbnail is copied to Supabase Storage within 2 min.
- Grid loads ≤800ms for 30-post window.
- After 30 days, thumbnails STILL render (no broken URLs from expired CDN).

## User Stories

- **US-01** — As a strategist, I open the analytics page and see a grid of recent posts with thumbnails, per-platform pill, posted-at, and headline metric (views or engagement).
- **US-02** — As a strategist, I can filter the grid by platform.
- **US-03** — As a strategist, I can sort by date / views / engagement rate.
- **US-04** — As a client viewer, I see the same grid in my portal (org-scoped).

## In Scope

- Migration `172_post_thumbnails.sql`:
  - Add `thumbnail_storage_url` to existing posts table (likely `postara_posts` per legacy naming).
  - Add `thumbnail_persisted_at`.
- Sync-time persistence:
  - When a post arrives via Zernio webhook OR daily sync, queue a thumbnail-fetch job.
  - Job downloads from Zernio CDN, uploads to Supabase Storage bucket `post-thumbnails/{client_id}/`, writes URL back.
  - Reuses pattern from `lib/audit/persist-scraped-images.ts`.
- Grid component: `components/analytics/post-grid.tsx`:
  - 9:16 aspect cards (mirrors VFF-08 card aspect since they're the same content shape).
  - Real thumbnail OR platform-tinted fallback with brand mark.
  - Hover: show numeric metrics.
- Filter + sort UI.

## Out of Scope

- Per-post good/bad badging (ZNA-05).
- Per-post engagement trajectory (ZNA-06).
- Editing post metadata (display-only here).

## Architecture Wiring

- Reuses `persistScrapedImages` pattern from audit.
- New bucket: `post-thumbnails` (verify or create).
- Existing posts table (`postara_posts`) gets new columns.
- Portal version: `app/portal/analytics/posts/page.tsx` with `getPortalClient()` scoping.

## Open Questions

1. Re-fetch thumbnail when post is edited? (Default: yes, treat update as a sync trigger.)
2. Storage cost — at 30 brands × 90 posts/month × 200kb each ≈ 540 MB/month. (Trivial; ignore.)
3. Headline metric per platform: views or engagement? (Default: views; engagement as hover state.)

## Assumptions

- Zernio gives us a thumbnail URL on every post sync (verify per platform; some need to be extracted from video first frame).
- Supabase Storage egress is included in current plan.
- 9:16 card aspect is correct (short-form video; matches VFF-08 consistency).

## Done When

- Sync persistence verified on next 3 client posts.
- Grid renders 100% thumbnails after 30 days (re-check 30 days post-launch).
- Visual QA: matches VFF-08 card density + admin shell tokens.
- Portal version verified org-scoped + read-only.
