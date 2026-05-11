# PRD: Viral Format Finder, Phase 03 — Cost-Effective Video Sourcing

> Series: Viral Format Finder · 03/10 · Draft 2026-05-10

## Purpose & Value

Bring videos in. Cheaply. The naive approach (scrape everything trending) burns Apify credits and YouTube API quota in days. This phase defines the sourcing pipeline: tight per-brand budgets, aggressive dedup, and a cache that survives Apify CDN expiry.

## Problem

Apify TikTok scrapes run ~$0.30 per 100 videos. Pulling 500 videos/day across 30 brands = $45/day = $1,350/month, and 80% of pulls are duplicates we already analyzed. The current audit scrapers (`scrape-tiktok-profile.ts` etc.) are profile-targeted, not discovery-targeted, so we can't reuse them as-is.

## Primary User

System (no human in this loop). Strategist sees the output via VFF-07.

## Goals (SMART)

- Cost per brand-day ≤ $0.50 (down from naive $1.50+).
- Dedup hit rate ≥ 70% within the first 30 days of operation.
- New video freshness: ≥80% of surfaced videos are <14 days old at first surface.
- Thumbnail persistence: 100% of analyzed videos have a Supabase Storage thumbnail (no expired Apify CDN URLs).

## User Stories

- **US-01** — As a strategist, the Format Finder shows new videos every day without me triggering a scrape.
- **US-02** — As a developer, I can see in `viral_videos` that the same TikTok URL was deduped against an existing row instead of re-scraping.
- **US-03** — As an admin, I can see daily spend per brand via a simple SQL view (`brand_format_spend_daily`).

## In Scope

- New cron `app/api/cron/format-discovery/route.ts` running every 6h:
  1. For each active brand, read seed_terms + reference_creator_handles from `brand_format_context`.
  2. Query Apify (TikTok), Apify (IG), and YouTube Data API in parallel, per-platform.
  3. For each result URL, check `viral_videos` for existing row → skip if found.
  4. New rows enter as `status='pending'` for VFF-04 to grade.
- Per-brand daily budgets (default 50 videos/day, env-tunable).
- Dedup index on `(platform, source_url_hash)` unique.
- Thumbnail persistence pipeline reusing `lib/audit/persist-scraped-images.ts` (extract; do not duplicate).
- Cost telemetry: every Apify run logs `apify_run_cost` to `api_error_log` (existing) tagged `vff_sourcing`.

## Out of Scope

- Analyzing the videos (VFF-05).
- Reranking pulled videos against brand relevance (VFF-08).
- Manual "discover more" trigger from the UI (defer to VFF-09).

## Architecture Wiring

- Reuse Apify clients already wired in `lib/audit/scrape-*-profile.ts`. Extract shared client to `lib/scrapers/apify-client.ts` if not already.
- YouTube channel/keyword search via existing YT Data API key in env (verify in `.env.local`).
- Cache + dedup via Postgres unique index; no Redis needed.
- Thumbnails written to Supabase Storage bucket `viral-thumbnails` (new).

## Open Questions

1. Reference-creator pulls vs keyword-search pulls — 50/50 split or weight one heavier? (Default: 70% creator, 30% keyword. Creators give consistent quality.)
2. Should we pull from US-only TikTok or global? (Default: brand-locale aware once we have it; US-only stub for v1.)
3. Re-scrape an already-analyzed video to refresh view count? (Default: no, take the snapshot at first ingest; freshness comes from new videos, not re-pulls.)

## Assumptions

- Apify accounts + budgets are configured (current audit flow uses them, so credentials exist).
- YouTube API quota is sufficient — measure first, request higher quota if needed.
- Supabase Storage egress is included; the bigger cost is Apify, not storage.

## Done When

- Cron runs successfully for 3 consecutive days.
- Cost per brand-day verified ≤ $0.50 via the new SQL view.
- Dedup hit rate ≥50% after 14 days (will climb toward 70% by day 30).
- All persisted thumbnails verify after 48h (no broken images).
