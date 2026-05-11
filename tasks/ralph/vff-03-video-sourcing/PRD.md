# PRD: VFF · 03 · Cost-effective video sourcing

> Viral Format Finder · 03/10 · 2026-05-10

## Purpose & Value

Bring videos in. Cheaply. The naive approach (scrape everything trending) burns Apify credits and YouTube API quota in days. This PRD defines a per-brand, per-platform discovery cron with tight budgets, aggressive dedup against `viral_videos`, and a thumbnail persistence step that survives Apify CDN expiry. After this PRD, the pipeline has a steady stream of new candidate videos for VFF-04 to gate.

## Problem

Apify TikTok scrapes cost ~$0.30 per 100 videos. Pulling 500 videos/day across 30 brands is ~$45/day, and 80% are duplicates the system has already analyzed. Existing audit scrapers in `lib/audit/scrape-*-profile.ts` are profile-targeted, not discovery-targeted. Without dedup + budget + thumbnail persistence, the surface either bankrupts the credits column or shows broken images within 48 hours.

## Primary User

System pipeline. Strategist consumes output via VFF-07. Admin checks daily spend via SQL view.

## SMART Goals

- Cost per brand-day <= $0.50 (down from naive $1.50+).
- Dedup hit rate >= 50% after 14 days, climbing toward 70% by day 30.
- New-video freshness: >=80% of newly inserted videos have `posted_at` within 14 days at first insert.
- Thumbnail persistence: 100% of `analysis_status != 'rejected'` videos older than 1h have a non-null `thumbnail_storage_url`.
- Cron completes per brand in <=60s on average; total cron run <=20min for current brand count.

## User Stories

- **US-01** — As a strategist, new candidate videos arrive every 6h without me triggering anything.
- **US-02** — As a developer, I can see in `viral_videos` that a re-encountered TikTok URL was deduped (no duplicate row, scrape count incremented in `raw_payload`).
- **US-03** — As an admin, I can `select * from brand_format_spend_daily` and see today's per-brand Apify cost.
- **US-04** — As the system, when Apify returns a thumbnail URL that points at a CDN we don't control, the thumbnail is downloaded to Supabase Storage and the row records the persistent URL.

## In Scope

- Cron route `app/api/cron/format-discovery/route.ts` (every 6h: 0/6/12/18 UTC).
- Per-brand budget enforcement (default 50 new videos/day, env `VFF_DAILY_VIDEOS_PER_BRAND`).
- Source mix: 70% reference-creator pulls, 30% seed-term keyword pulls (D-01).
- Three platforms parallelized: TikTok (Apify), Instagram Reels (Apify), YouTube Shorts (YouTube Data API).
- Dedup via existing `uq_viral_videos_platform_hash` unique index (VFF-01).
- Thumbnail persistence using existing `lib/audit/persist-scraped-images.ts` (extract a shared helper if `viral-thumbnails` bucket needs a different path prefix).
- New Supabase Storage bucket `viral-thumbnails` (public read).
- Cost telemetry: each Apify run writes one row to `api_error_log` (existing) tagged `vff_sourcing` with success + cost columns (re-using existing JSON metadata field).
- SQL view `brand_format_spend_daily` for admin SQL access.
- Manual-trigger endpoint `POST /api/admin/formats/discover` for ad hoc per-brand re-pulls (admin auth, rate-limited 3 calls / 10 min / brand).

## Out of Scope

- Analysis (VFF-04 gate + VFF-05 analysis).
- Ranking the resulting videos by brand fit (VFF-08).
- Re-scraping already-analyzed videos to refresh view counts (D-03).
- Per-locale ingestion (US only v1, locale-aware deferred).

## Resolved Decisions

- **D-01** — Reference-creator vs keyword pulls split? **→ 70/30 creator/keyword.** Rationale: creators produce more consistent quality; keyword pulls cover emerging trends.
- **D-02** — Locale? **→ US-only v1.** Rationale: most active clients are US-targeted; per-locale support deferred until first international client requests it.
- **D-03** — Re-scrape analyzed videos to refresh view counts? **→ No.** Rationale: freshness comes from new videos; ranking can use posted_at + initial view count alone.
- **D-04** — Where do new video rows enter the lifecycle? **→ `analysis_status = 'pending'`.** Rationale: VFF-04 gate runs on the pending queue; matches schema set in VFF-01.
- **D-05** — Apify run telemetry storage? **→ `api_error_log` with `endpoint = 'vff_sourcing'`, success rows included.** Rationale: avoids new telemetry table; existing table already powers admin spend dashboards.
- **D-06** — Thumbnail bucket? **→ New bucket `viral-thumbnails`, public read, organized as `<platform>/<video_id>.<ext>`.** Rationale: keeps audit thumbnails out of VFF concerns; predictable path simplifies CDN edge caching.
- **D-07** — How many seed terms to pull per cron run per brand? **→ Top 5 seeds by ranking, plus all reference creators in `reference_creator_handles` capped at 6 per platform.** Rationale: keeps total Apify calls per brand bounded; ~15 calls per brand per 6h.
- **D-08** — What happens when daily budget hits? **→ Cron short-circuits the brand for the day, logs `budget_capped` in telemetry, resumes the next UTC day.** Rationale: predictable cost ceiling; no surprise overruns.
- **D-09** — Apify failure handling? **→ Retry once with 2s backoff, then skip platform for the brand this run; per-brand circuit breaker after 3 consecutive failures within 24h.** Rationale: prevents one bad creator handle from blocking the whole cron.
- **D-10** — `raw_payload` size cap? **→ 8 KB per row; trim fields and store a `truncated: true` flag.** Rationale: bounded row size keeps `viral_videos` queryable.

## Data Model

No new tables. Extends existing `viral_videos` (VFF-01).

### Optional supporting SQL (no migration needed)

```sql
-- View for admin daily spend per brand. Created idempotently in T13.
CREATE OR REPLACE VIEW brand_format_spend_daily AS
SELECT
  (metadata ->> 'client_id')::uuid AS client_id,
  date_trunc('day', created_at)::date AS spend_date,
  SUM(COALESCE((metadata ->> 'apify_cost_usd')::numeric, 0)) AS apify_cost_usd,
  COUNT(*) FILTER (WHERE success = true) AS calls_succeeded,
  COUNT(*) FILTER (WHERE success = false) AS calls_failed
FROM api_error_log
WHERE endpoint = 'vff_sourcing'
  AND created_at >= now() - interval '90 days'
GROUP BY 1, 2;
```

This view is created at runtime via `execute_sql` from a one-off setup script (`scripts/setup-brand-format-spend-view.ts`) rather than a migration; the structure can change without a DB migration churn.

## API Contracts

### `POST /api/cron/format-discovery`
Auth: `Authorization: Bearer ${CRON_SECRET}`.
Request: empty body.
Response (200):
```ts
{
  brands_processed: number;
  videos_attempted: number;
  videos_inserted: number;
  videos_deduped: number;
  total_apify_cost_usd: number;
  duration_ms: number;
  per_platform: {
    tiktok: { inserted: number; deduped: number; failed: number };
    instagram: { inserted: number; deduped: number; failed: number };
    youtube: { inserted: number; deduped: number; failed: number };
  };
  errors: Array<{ client_id: string; platform: string; message: string }>;
}
```
Errors: 401 unauthorized, 500 server.

### `POST /api/admin/formats/discover`
Auth: admin.
Request:
```ts
const RequestSchema = z.object({
  client_id: z.string().uuid(),
  platforms: z.array(z.enum(['tiktok', 'instagram', 'youtube'])).min(1).default(['tiktok', 'instagram', 'youtube']),
});
```
Behavior: ad hoc run for one brand; respects daily budget (returns 429 if cap hit), respects 3-per-10-min rate limit per brand via in-memory counter (good enough for single-region deploy v1).
Response (200): same shape as cron route but scoped to one brand.
Errors: 400 invalid input, 401 unauthorized, 403 forbidden, 404 client / context not found, 429 over budget or rate-limited, 500 server.

## LLM Prompts

None in this PRD. Sourcing is mechanical (Apify + YouTube Data API).

## UI Components

None in this PRD. Admin views land in VFF-07. The ad hoc trigger endpoint is wired but no UI button until VFF-07.

## File Map

Create:
- `app/api/cron/format-discovery/route.ts`
- `app/api/admin/formats/discover/route.ts`
- `lib/analytics/format-sourcing.ts` (orchestrator: `discoverForBrand(clientId, opts)`)
- `lib/analytics/sources/tiktok-discovery.ts` (Apify TikTok creator + keyword wrappers)
- `lib/analytics/sources/instagram-discovery.ts` (Apify IG)
- `lib/analytics/sources/youtube-discovery.ts` (YouTube Data API)
- `lib/analytics/format-sourcing.test.ts`
- `lib/analytics/persist-viral-thumbnail.ts` (wraps `lib/audit/persist-scraped-images.ts`, targets `viral-thumbnails` bucket)
- `scripts/setup-brand-format-spend-view.ts` (one-off `CREATE OR REPLACE VIEW`)
- `scripts/setup-viral-thumbnails-bucket.ts` (idempotent create-bucket + RLS-public-read)
- `tasks/ralph/vff-03-video-sourcing/progress.txt`

Modify:
- `vercel.json` (register cron: `0 */6 * * *` — every 6h)
- `.env.example` (add `VFF_DAILY_VIDEOS_PER_BRAND`, `VFF_APIFY_TIKTOK_ACTOR`, `VFF_APIFY_IG_ACTOR`, `YOUTUBE_DATA_API_KEY` if not already; verify `APIFY_TOKEN` present)
- `lib/audit/persist-scraped-images.ts` (extract `persistImage(bucket, path, sourceUrl)` if it is currently hard-coded to the audit bucket; otherwise no change)

## Env Vars

New:
- `VFF_DAILY_VIDEOS_PER_BRAND` — int default 50; per-brand daily cap.
- `VFF_APIFY_TIKTOK_ACTOR` — Apify actor id (str) for TikTok scrape (e.g. `clockworks/tiktok-scraper`).
- `VFF_APIFY_IG_ACTOR` — Apify actor id (str) for Instagram Reels (e.g. `apify/instagram-scraper`).
- `YOUTUBE_DATA_API_KEY` — verify present; create if not (Google Cloud Console).

Reused: `APIFY_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Edge Cases

- **Brand has no `brand_format_context` row.** Cron skips with telemetry entry `no_context`. VFF-02 cron is expected to backfill within 24h.
- **`brand_format_context.seed_terms` is empty.** Cron uses only the reference creators; if those are also empty, skip with `no_signals` log.
- **Reference creator handle is invalid.** Apify run returns empty; circuit breaker counts the failure (D-09).
- **YouTube Data API quota exhausted.** Cron logs `quota_exhausted` and skips YouTube for the rest of the UTC day for the affected brand.
- **Thumbnail download 404s.** Insert row with `thumbnail_storage_url = null` and `thumbnail_source_url` preserved; retry via a follow-up job or admin trigger.
- **Apify returns a video already in `viral_videos`.** Dedup hit; do NOT increment any metric column (D-03); optionally write `raw_payload.last_seen_at` for telemetry only.
- **`raw_payload` larger than 8 KB.** Truncate to selected fields (`id, url, viewCount, likeCount, commentCount, shareCount, createTime, author, thumbnail`) and set `raw_payload.truncated = true`.
- **`source_url_hash` collision (improbable).** Existing unique index returns 23505; upsert with `ON CONFLICT DO NOTHING`; do not raise.
- **Rate-limit ad hoc trigger.** Simple in-memory counter; if process restarts, counter resets (acceptable v1).

## Test Plan

Unit:
- `lib/analytics/format-sourcing.test.ts`:
  - 70/30 split respected when both signal types present.
  - Falls back to creator-only when seeds empty.
  - Falls back to seed-only when creators empty.
  - Skips brand when both signals empty.
  - Budget cap short-circuits subsequent platforms after limit hit.
- `lib/analytics/persist-viral-thumbnail.test.ts`:
  - Writes to `viral-thumbnails/<platform>/<id>.<ext>`.
  - Idempotent: re-call with same id returns existing URL without re-download.

Integration:
- Run `npx tsx scripts/setup-viral-thumbnails-bucket.ts` against staging; bucket exists with public-read policy.
- Run `npx tsx scripts/setup-brand-format-spend-view.ts`; view returns rows.
- POST cron route with a single seeded brand; verify rows in `viral_videos` and telemetry in `api_error_log`.

E2E: none (no UI in this PRD).

Manual QA:
- Trigger cron locally for one brand; spot-check 5 inserted rows for `thumbnail_storage_url`, `posted_at`, `views_count` non-null.
- Re-trigger; verify deduped count climbs and inserted does not double.

## Architecture Wiring

- Cron registered in `vercel.json` `crons` array. `maxDuration = 300` per route file via `export const maxDuration = 300`.
- Apify clients follow the same pattern as `lib/audit/scrape-tiktok-profile.ts`; share a base helper if convenient but do not break existing audit consumers.
- Telemetry rows land in `api_error_log` with `endpoint = 'vff_sourcing'` and a `metadata` JSON column containing `client_id`, `platform`, `apify_cost_usd`, `videos_inserted`, `videos_deduped`.
- Per VFF-02 D-05, this cron reads `brand_format_context` rows directly (no helper call needed for cron, but `getBrandFormatSeeds()` may be reused).

## Done When

- Cron successfully writes new rows for at least 3 active brands on 3 consecutive 6h runs.
- `brand_format_spend_daily` view returns numbers within budget for all 3 days.
- Spot-check 20 rows show valid `thumbnail_storage_url` 1h post-insert.
- Dedup count > 0 by run 3.
- `npx tsc --noEmit` clean, `npm run lint` clean.
- progress.txt fully `[x]`.
