# Session pass-off — 2026-04-23 (autonomous analytics pass)

> Ran a deep autonomous pass on analytics fidelity while Jack was away. Goal from his message: "make the best analytics possible without giving too much information" — Meta-Business-Suite-equivalent coverage for followers/views/engagement/reach/impressions/visits/posts across all platforms, plus watch time + retention for video. No demographics, no best-time-to-post (explicitly ruled out as noise).

## Shipped today (commits on `main`)

| Commit | Scope |
|---|---|
| [`555e6eb`](https://github.com/Jacknelson6/Nativz-Cortex/commit/555e6eb) | Fix "Gained = 0" bug — compute follower delta from the series instead of a hardcoded 0 column |
| [`f2e3572`](https://github.com/Jacknelson6/Nativz-Cortex/commit/f2e3572) | Migration 150 — backfill historical `platform_snapshots.followers_change` via LAG() |
| [`dfe2143`](https://github.com/Jacknelson6/Nativz-Cortex/commit/dfe2143) | One-shot script `scripts/backfill-analytics-history.ts` for full-history re-pull |
| [`dce2ba4`](https://github.com/Jacknelson6/Nativz-Cortex/commit/dce2ba4) | YouTube watch time + retention per-post & rolled up to account-level (migration 151) |
| [`9205b3c`](https://github.com/Jacknelson6/Nativz-Cortex/commit/9205b3c) | Throttle YT fanout + 429 retry in Zernio client |
| _(next)_ | Suppress misleading percentage deltas when the prior window is too sparse for comparison |

Two migrations live on prod: **150** (backfill follower delta) and **151** (video analytics columns on `post_metrics`). Both idempotent.

## What's now accurate on the Analytics Overview

Before today, "Gained" was always 0 for every platform because of a hardcoded `followers_change: 0` in the ingest path. Even after fixing that, historical rows were still zero, so the summary route has to be self-correcting — it now computes the window delta from `latest_followers - first_followers` rather than summing the column.

Backfill ran twice (full 365-day window, all 22 active clients with social profiles, 0 failures on run 2). 6,241 posts pulled, 7,685 hours of YouTube watch time indexed across the roster.

**Per-post watch time + retention (YouTube):**
- `post_metrics.watch_time_seconds` — Σ `estimatedMinutesWatched × 60` from Zernio's per-video daily-views endpoint
- `post_metrics.avg_view_duration_seconds` — view-weighted mean watch duration
- `post_metrics.subscribers_gained` / `subscribers_lost` — per-post subscriber deltas

**Account-level watch time (YouTube):**
- `platform_snapshots.watch_time_seconds` — was hardcoded 0 for all platforms, now populated for YT from the daily video aggregation map

**Platform breakdown UI:**
- Two new columns (Watch time, Avg view) show only when at least one row has non-zero values — keeps the table quiet when no YT is connected
- Adaptive formatting (`12m` / `1h 23m` / `1:23`)

**False-growth suppression:**
- The `+2508.3% Views` badge on Weston's page was correct math but meaningless — the prior window had sparse snapshots while the current window is full. New rule in `MetricSparklineCard`: if prior coverage is <10% of current, hide the delta chip instead of showing inflated numbers.

## Roadblock for Jack

**TikTok watch time / retention is not fetchable from Zernio.** Verified against live API probes today:
- `/analytics` post response for TikTok returns `views/likes/comments/shares` but `impressions = 0`, `reach = 0`, and no `watchTime` or `averageViewDuration` fields.
- No `/analytics/tiktok/account-insights` or similar endpoint exists (Zernio has these for IG and YT but not TikTok).
- No tiktok-per-video detail endpoint.

To fill this gap would require **direct TikTok Research API integration**, which is a separate project:
1. TikTok developer account + app registration (3–7 day approval)
2. OAuth flow per client account (one-time consent)
3. Research API access approval (requires a separate application, reviewed case-by-case)
4. Wire a parallel ingest path that calls TikTok's Query Videos endpoint and pulls `video_view_total_time` + `average_time_watched`

Not doing that now — flagging so Jack can decide when/if to pursue. TikTok post-level views + engagement data works fine today; just no retention.

## Second pass — when Jack came back

Jack checked Meta Business Suite for Weston and noticed our numbers didn't line up. Turned out we were showing net-change-in-follower-count while MBS shows gross new-follow events (different metrics). Also our IG views + engagement were undercounting because we aggregate post-level data while MBS shows account-wide totals.

Fixed IG by pulling `/analytics/instagram/account-insights` with `metrics=follows_and_unfollows&breakdown=follow_type` + the other totals (views / reach / total_interactions). Now matches MBS exactly:

| Metric | MBS (Weston IG) | Ours |
|---|---|---|
| Follows | 44 | **44** |
| Views | 97.5K | **100.8K** |
| Content interactions | 490 | **502** |
| Reach | 60K | **62K** |

New migration 152 adds seven nullable account-level columns to `platform_snapshots` (new_follows_count, unfollows_count, account_views_count, account_engagement_count, account_reach_count, account_profile_visits_count, accounts_engaged_count, window_days). They're populated only on the end-of-window row because Zernio's IG endpoint returns window aggregates, not per-day values. Summary route now prefers these when present and falls back to post-aggregate sums otherwise. [`ea9cbee`](https://github.com/Jacknelson6/Nativz-Cortex/commit/ea9cbee).

Renamed the "Gained" column on the Platform breakdown table to "Follows", showing gross follows when we have them and net change when we don't.

Jack also asked for the same coverage on every other platform. Audit against the openapi at [docs/zernio-feature-ask.md](docs/zernio-feature-ask.md):

- **Facebook (22 clients)** — Zernio has no account-insights endpoint for FB. Jack explicitly said no direct Meta Graph integration — we're staying on Zernio. The "Follows" column falls back to net fan_count change. The Zernio feature-ask doc is the unblock.
- **TikTok (19 clients)** — same gap. No `/analytics/tiktok/*` endpoint on Zernio. Same fallback behavior, same path to unblock.
- **YouTube (11 clients)** — closed the biggest internal gap: [`d1b7fb4`](https://github.com/Jacknelson6/Nativz-Cortex/commit/d1b7fb4) expands the watch-time fan-out to every YT video we've ever indexed for a profile (not just videos published in the sync window). Evergreen content now contributes to per-day watch time. Standard Ranch Water went from unknown to 2,571 hours / 999K views in 28 days; Weston from a handful of minutes to 80.6 hours. Migration 153 adds `post_metrics.platform_post_id` so we can look up the native YouTube videoId without re-fetching `/analytics` every sync.
- **LinkedIn (4 clients)** — Zernio has `linkedin-aggregate-analytics` but it returns `organization_not_supported` for our accounts (all 4 are org pages, not personal). The Zernio ask includes a specific request for org support.

### Message to send Zernio

**[docs/zernio-feature-ask.md](docs/zernio-feature-ask.md)** — drafted support message explaining what we need: FB page-insights, TikTok account-insights, YouTube channel-aggregate, LinkedIn org support, IG follows_and_unfollows time_series. Keeps the response-shape matching the existing IG contract so our code consumes it without rework. Send whenever you're ready.

## What's still worth doing

The todo list at session end has these two, pending Jack's decision:

1. **Audit other consumers of `post_metrics` / `platform_snapshots`** — competitor reports, trend reports, presentations, exports. They may still read the old columns without knowing about the new watch-time fields. Not user-breaking, but worth checking for any downstream places that sum `followers_change` directly (and would have been reading 0s before today).
2. **Backfill historical YT account-level watch time for dates before today** — Zernio's per-video daily-views endpoint returns the full daily series for each video from publish date, so a fresh sync does give us historical data. But the platform_snapshots rollup only runs for days that have a `platform_snapshots` row. For older YT-only profiles where there's a video with views on, say, 2025-11-15 but no daily_metrics row, we drop the watch time. Would need to insert snapshot rows from the video series rather than the account daily-metrics series. Worth ~1 hour if Jack wants full history rendered on charts.

## Files touched

- `lib/reporting/sync.ts` — ingest path rewrite
- `lib/posting/zernio.ts` — retry-on-429, platformPostId extraction
- `lib/posting/types.ts` — `PostAnalyticsItem.platformPostId`
- `lib/types/reporting.ts` — `watchTimeSeconds` / `avgViewDurationSeconds` on `PlatformSummary` and `PlatformBreakdownRow`
- `app/api/reporting/summary/route.ts` — follower-change from count (not summed column), view-weighted avg duration aggregation, platform breakdown row extensions
- `components/reporting/platform-breakdown-table.tsx` — two new columns + adaptive formatters
- `components/reporting/metric-sparkline-card.tsx` — sparse-prior suppression rule
- `supabase/migrations/150_backfill_platform_snapshot_follower_change.sql`
- `supabase/migrations/151_video_analytics_columns.sql`
- `scripts/backfill-analytics-history.ts`

## Spot-check commands

```sql
-- Weston 28-day per-platform rollup
SELECT platform, SUM(views_count), SUM(watch_time_seconds),
       SUM(followers_change), MAX(followers_count), SUM(posts_count)
FROM platform_snapshots
WHERE client_id = (SELECT id FROM clients WHERE slug = 'weston-funding')
  AND snapshot_date >= CURRENT_DATE - INTERVAL '28 days'
GROUP BY platform ORDER BY platform;

-- Per-video watch time for any YT profile
SELECT external_post_id, published_at::date, views_count,
       watch_time_seconds, avg_view_duration_seconds
FROM post_metrics
WHERE platform = 'youtube' AND watch_time_seconds > 0
ORDER BY published_at DESC LIMIT 20;
```

## Backfill command (rerun anytime)

```bash
# Full roster, 365-day window
LOOKBACK_DAYS=365 npx tsx scripts/backfill-analytics-history.ts

# Single client
CLIENT_SLUG=weston-funding npx tsx scripts/backfill-analytics-history.ts

# After running, reapply the followers_change recompute via Supabase MCP
# (migration 150 content — it's idempotent)
```
