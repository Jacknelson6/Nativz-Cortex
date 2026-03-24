# PRD — Topic research (segment 1)

## Purpose
Collect multi-platform listening data and AI narrative for a query, scoped optionally to a client.

## Existing behavior
- Start: `POST /api/search/start` → `/admin/search/[id]/processing` → `POST /api/search/[id]/process`.
- Results: metrics, emotions, trending topics, `platform_data.sources` (v2), SERP (v1/v2).

## Outputs consumed downstream
- **Moodboard:** Video URLs from `platform_data.sources` (YouTube, TikTok, Instagram patterns) + `serp_data.videos` + topic `sources` with video-like URLs.
- **Ideas:** `search_id` passed to `POST /api/ideas/generate` (already).

## Acceptance
- [ ] Completed search shows **Ideation pipeline** with step 1 marked complete.
- [ ] One-click **Build inspiration board** when URLs exist; disabled with explanation when none.

## Atomic steps
1. Open `/admin/search/new` → run research → land on `/admin/search/[id]` with `status=completed`.
2. Confirm `platform_data` or `serp_data` present in DB for multi-platform runs.
