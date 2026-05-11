# PRD: Viral Format Finder, Phase 01 — Scaffolding & Data Model

> Series: Viral Format Finder · 01/10 · Draft 2026-05-10

## Purpose & Value

Stand up the bones of a "Netflix for short-form formats" surface inside Cortex. This phase ships nothing user-facing beyond an empty shell and the data model every later phase will read and write to. Zero new analysis, zero scraping, zero UI polish, just the foundation that the next nine PRDs plug into without re-litigating schema.

## Problem

Right now, format intelligence (what's working on TikTok / Reels / Shorts this week) lives in the strategist's head and ad-hoc Loom recordings. There's no Cortex-native place to browse, save, or reference formats. We can't even start building the discovery / analysis / UI layers until we agree where the data lives and how it relates to brands.

## Primary User

Internal strategists (admin role). Phase 1 has no portal surface.

## Goals (SMART)

- Migration applied to staging within day 1, prod within day 3.
- New route `/admin/formats` reachable, renders empty state, links from sidebar Intelligence section.
- All five new tables pass RLS smoke test (`scripts/smoke-rls.ts`).
- Zero regressions to existing audit or analytics queries (verified by `npx tsc --noEmit` + `npm run test:e2e`).

## User Stories

- **US-01** — As an admin, I can click "Formats" in the sidebar and land on an empty `/admin/formats` page that explains the feature is coming.
- **US-02** — As a developer, I can insert a `viral_videos` row + tag it with a `viral_formats` entry and see the join propagate through `viral_video_formats`.
- **US-03** — As an admin, I cannot accidentally write to format tables from a portal (`viewer`) session — RLS denies the insert.

## In Scope

- Migration `168_viral_formats.sql` creating:
  - `viral_formats` (taxonomy: id, slug, label, dimension, description, created_at). Dimension enum: `hook_type` | `structure` | `archetype` | `pacing`.
  - `viral_videos` (id, platform, source_url, posted_at, scraped_at, raw_metrics jsonb, analysis_data jsonb nullable, status enum: `pending` | `analyzed` | `rejected`).
  - `viral_video_formats` (join: viral_video_id, viral_format_id).
  - `viral_collections` (id, slug, label, kind enum: `system_curated` | `brand_scoped`, brand_id nullable).
  - `viral_collection_videos` (join: collection_id, video_id, position).
- RLS policies: admin full CRUD; viewer read-only on `viral_videos` + collections scoped to their `organization_id` via brand_id.
- Sidebar entry under Intelligence (between Audits and Topic Search).
- `/admin/formats/page.tsx` empty-state shell using existing `IconCard` from `section-card-design-system`.

## Out of Scope

- Any actual scraping, analysis, or UI rendering (later phases).
- Portal access (decide in VFF-10).
- Backfill of historical data.

## Architecture Wiring

- Route slot: `app/admin/formats/page.tsx`. Mirrors `app/admin/audit/page.tsx` skeleton.
- Sidebar: add entry in `components/layout/admin-sidebar.tsx` under the Intelligence group (Title Case label per `feedback_sidebar_title_case.md`).
- Types: generate Supabase types via MCP after migration applies, update `lib/database.types.ts`.
- Shared types file: `lib/formats/types.ts` exporting `ViralVideo`, `ViralFormat`, `ViralCollection`, `FormatDimension`.

## Open Questions

1. Should `viral_videos.platform` reuse `AuditPlatform` from `lib/audit/types.ts` or a new union? (Default: reuse, drop Facebook since it's not short-form.)
2. Brand-scoped collections — store as `brand_id` FK to `clients` or a new `brands` entity? (Default: FK to `clients` for now, revisit if we split prospects out per SPY-01.)
3. Soft-delete vs hard-delete on `viral_videos`? (Default: soft via `deleted_at`, matches existing audit pattern.)

## Assumptions

- Next migration number is 168 (verify against `supabase/migrations/` at apply time).
- Existing `clients.organization_id` is the right scoping anchor for brand-scoped collections (consistent with portal security rule in CLAUDE.md).
- No external dependency changes; pure schema + scaffold work.

## Done When

- Migration applied to prod.
- `/admin/formats` renders without errors.
- `npx tsc --noEmit` clean.
- Sidebar link clickable, highlights when active.
