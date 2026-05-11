# PRD: Viral Format Finder, Phase 05 — Intelligent Video Analysis

> Series: Viral Format Finder · 05/10 · Draft 2026-05-10

## Purpose & Value

Turn a passing video (post-VFF-04 gate) into structured format intelligence. This is where Gemini Vision earns its keep: hook type, narrative structure, archetype, pacing, and a one-line "engagement hook descriptor" that becomes the card subtitle in VFF-08.

## Problem

A scraped video URL with a view count is not useful intelligence. The strategist wants to know "this is a comparison hook, two-thirds in the form of a list, archetype = b-roll voiceover, why it works = the 3-second tension before the first comparison." Without that, the format library is just another TikTok feed.

## Primary User

System (analysis pipeline). Strategist consumes the output via cards and detail view (VFF-08 / VFF-09).

## Goals (SMART)

- Analysis cost ≤ $0.02 per video.
- Latency: p50 ≤ 15s, p95 ≤ 45s per video.
- Schema completeness: 100% of analyzed videos have non-null values for hook_type, structure, archetype, engagement_hook_descriptor, why_it_works.
- Quality: ≥85% of strategist spot-checks rate the analysis "accurate or close enough" (weekly 20-video sample).

## User Stories

- **US-01** — As a system, when a video advances to `status='analyzing'`, Gemini Vision processes its first 30s + caption + comments-sample within 45s and writes structured fields to `viral_videos.analysis_data`.
- **US-02** — As a strategist, when I open the detail view (VFF-09), I see all five fields rendered cleanly with the model's reasoning visible.
- **US-03** — As a developer, I can re-run analysis on a single video via `npx tsx scripts/reanalyze-viral-video.ts <id>`.

## In Scope

- New file `lib/formats/analyze-video.ts` exporting `analyzeViralVideo(video)`.
- Gemini 2.5 Flash via existing `GOOGLE_AI_STUDIO_API_KEY` (per `MEMORY.md`).
- Input: video MP4 url (pre-rasterized first 30s if duration > 30s — reuse logic from `lib/audit/analyze-videos.ts`), caption text, top 10 comments.
- Output schema (stored in `viral_videos.analysis_data` jsonb):
  ```ts
  {
    hook_type: string;           // foreign key to viral_formats.slug where dimension='hook_type'
    structure: string;           // same, dimension='structure'
    archetype: string;           // same, dimension='archetype'
    pacing: string;              // same, dimension='pacing'
    engagement_hook_descriptor: string;  // single-line subtitle for card overlay
    why_it_works: string;        // 2-3 sentence explainer
    retention_pattern: string;   // narrative arc description
    embedding: number[];         // Gemini Embedding 001 of why_it_works + descriptor
  }
  ```
- Status transitions: `analyzing` → `analyzed` on success, → `failed` with retry queue on error.
- Embedding pre-computed for VFF-08 ranking.

## Out of Scope

- Reanalysis on schema change (manual script only).
- Multi-model ensembling (single-model v1).
- Translation of non-English captions (stretch — v2).

## Architecture Wiring

- Reuses `lib/audit/analyze-videos.ts` patterns for MP4 fetching + trimming.
- Reuses Gemini client setup from existing semantic-search work.
- Embedding column added in VFF-01 migration — populated here.
- Queue worker: extends existing audit worker pattern. Same Vercel Function with longer max-duration if needed.

## Open Questions

1. Trim to 30s, or analyze full duration up to 90s cap from VFF-04? (Default: 30s — most short-form hooks land in the first 15-30s anyway, saves cost.)
2. Should `hook_type` etc. be open-ended strings or strictly enum'd to `viral_formats.slug`? (Default: strict enum, model picks closest match from a seeded taxonomy — VFF-06.)
3. Comments-sample — top 10 by likes or random? (Default: top by likes, reveals audience reaction.)

## Assumptions

- Gemini Flash handles 30s MP4 + ~1k tokens of text consistently (verified in existing audit flow).
- Per-call cost is ≤ $0.02 (verify on first 100 runs).
- Strategist trust will build over weeks; we'll add a "thumbs down" feedback loop in v2 to tune.

## Done When

- 100 videos analyzed end-to-end.
- Cost + latency targets verified.
- Strategist signs off on 17/20 spot-checked outputs.
- Embedding column populated for all analyzed rows.
