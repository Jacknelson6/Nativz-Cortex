# PRD: Viral Format Finder, Phase 02 — Brand-Aware Ingestion Signals

> Series: Viral Format Finder · 02/10 · Draft 2026-05-10

## Purpose & Value

Before we scrape anything, we need to decide WHICH formats matter to which brands. A travel brand and a SaaS brand should not see the same TikTok format library on their landing page. This phase wires the brand profile, content pillars, and audience model into a single `brand_format_context` view that downstream ingestion (VFF-03) and ranking (VFF-08) consume.

## Problem

A format library that ignores brand is just a TikTok trending page with extra steps. The strategist's job is "what works for THIS brand right now," not "what's viral globally." Without a brand-aware filter, the experience is noise.

## Primary User

Internal strategists. Indirectly, the ingestion + ranking pipelines.

## Goals (SMART)

- Every active brand has a populated `brand_format_context` row within 24h of this phase shipping.
- A new view, `get_brand_format_seeds(brand_id)`, returns ≥5 seed terms and ≥3 reference creators for ≥90% of brands.
- Ranking math (VFF-08) uses this context — verified by a cosine-similarity smoke test in `scripts/smoke-format-relevance.ts`.

## User Stories

- **US-01** — As a strategist, when I open `/admin/formats?brand=nike`, the seed terms feeding the Netflix rows clearly come from Nike's brand profile (e.g. "running," "team sport," "athlete spotlight"), not generic trending tags.
- **US-02** — As a strategist, I can edit a brand's format seeds inline from the brand profile page when the auto-extracted ones are wrong.
- **US-03** — As an admin, I can inspect a `brand_format_context` row via SQL and see exactly which fields drove a recommendation.

## In Scope

- New table `brand_format_context` (one row per brand):
  - `brand_id`, `seed_terms` text[], `excluded_terms` text[], `reference_creator_handles` jsonb (per platform), `pillar_weights` jsonb, `tone_descriptors` text[], `updated_at`, `last_recomputed_at`.
- Extraction job: nightly cron reads `brand_profiles` + `content_pillars` + `clients.services` → populates context row.
- Manual override UI: edit panel on `/admin/clients/[id]/brand-profile` ("Format-finder seeds" section).
- Embedding column: `seed_embedding vector(1536)` (Gemini Embedding 001) for cosine-similarity matching against video analysis embeddings in VFF-08.

## Out of Scope

- Actually surfacing the formats (VFF-07).
- Re-embedding video corpus when context changes (handled per-video in VFF-05).

## Architecture Wiring

- Cron: extend `app/api/cron/daily-snapshots/route.ts` or add new `app/api/cron/recompute-format-context/route.ts`.
- Reuse Gemini Embedding 001 client from `lib/ai/embeddings.ts` (already wired for semantic search per `MEMORY.md`).
- Reads from `brand_profiles`, `content_pillars`, `clients` tables (existing).
- Writes to `brand_format_context` (new in this phase).
- Override UI: add section to `components/brand-profile/brand-profile-editor.tsx` (existing).

## Open Questions

1. Should excluded_terms be auto-populated from past "low-relevance" user actions, or fully manual? (Default: manual to start, add learning loop in v2.)
2. Per-platform handle lists, or a single flat list? (Default: per-platform — TikTok creators are different from YT.)
3. What's the cap on seed_terms? (Default: 25, beyond that signal degrades.)

## Assumptions

- `brand_profiles` is the source of truth for tone + audience (verified — `MEMORY.md` references `.impeccable.md` and brand DNA work).
- Gemini Embedding 001 stays the embedding model (consistent with knowledge graph).
- Strategists will edit context for ~10% of brands; the other 90% works auto-extracted.

## Done When

- All active brands have a context row.
- Override UI shipped + verified visually.
- Smoke script returns ≥0.6 cosine similarity between a brand's seeds and a hand-tagged on-brand video.
