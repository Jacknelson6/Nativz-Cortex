# Feature ask: account-level insights parity across platforms

Draft message to Zernio support, requesting analytics endpoints to close the gap between what Zernio exposes today and what native dashboards (Meta Business Suite, TikTok Analytics, YouTube Studio, LinkedIn Page Analytics) show.

---

**Subject:** Analytics parity for Facebook / TikTok / YouTube / LinkedIn pages — matching IG account-insights

Hey team,

First — the Instagram account-insights endpoint (`/v1/analytics/instagram/account-insights`) is exactly the kind of analytics surface we need. `metrics=follows_and_unfollows` with `breakdown=follow_type`, plus account-wide `views`, `reach`, `accounts_engaged`, and `total_interactions` as `total_value` totals — that gave us near-perfect parity with Meta Business Suite. Great work on that.

To build a polished analytics experience across every connected platform, we're hitting gaps on the non-IG surfaces. Here's what would close the gap, in priority order:

## 1. Facebook page insights (biggest gap — affects all 22 of our clients)

Need a `/v1/analytics/facebook/page-insights` endpoint mirroring the IG version. Meta Graph exposes everything; we just can't get to it without the page access token.

Minimum viable:
- `page_fan_adds` (gross new follows per window — this is the #1 ask)
- `page_fan_removes` (unfollows)
- `page_impressions` (account-wide impressions)
- `page_impressions_unique` (reach)
- `page_views_total` (page views)
- `page_post_engagements` (total interactions)
- `page_video_views`, `page_video_views_3s`, `page_video_view_time`

All available on Meta Graph `/{page-id}/insights`. Window totals + daily time series would both be useful; `total_value` alone would already unblock us.

## 2. TikTok account insights (19 clients)

Need a `/v1/analytics/tiktok/account-insights` endpoint. TikTok's Research API / Display API exposes these; your standard `/analytics` response returns `0` for `impressions` / `reach` for TikTok accounts because that data lives elsewhere.

Minimum viable:
- `video_views` (account-wide, window total)
- `profile_views`
- `follower_count` breakdown (gross follows vs. unfollows per window)
- `likes`, `comments`, `shares`, `saves` as account aggregates (not just per-post)

Per-video detail (equivalent to your YouTube daily-views):
- `video_view_total_time` (total watch time per video, per day)
- `average_time_watched` (avg watch duration)
- `full_video_watched_rate` (completion rate)
- `impression_source` breakdown (For You / following / personal / search / hashtag)
- `follow_count_from_video` (follows attributable to a specific video)

TikTok's data delay is ~24h, same as IG, so freshness parity is fine.

## 3. YouTube channel insights (11 clients)

Your `/analytics/youtube/daily-views?videoId=X` is great for per-video pulls, but we currently have to loop through every video to assemble account-level totals. A `/v1/analytics/youtube/channel-insights` that returns pre-aggregated account metrics would replace dozens of per-video round-trips.

Minimum viable (window totals + daily time series):
- `views` (channel-wide)
- `estimatedMinutesWatched`
- `averageViewDuration`
- `subscribersGained` / `subscribersLost` (gross, not net)
- `impressions`
- `impressionsClickThroughRate`
- `comments`, `likes`, `dislikes`, `shares`

All available from YouTube Analytics API v2 / `reports` endpoint.

## 4. LinkedIn page (organization) insights (4 clients)

`/v1/accounts/{accountId}/linkedin-aggregate-analytics` works for personal accounts, but the doc notes organization pages should use `/v1/analytics` — which doesn't give us the same account-level shape. Add:

- Organization-level aggregate analytics endpoint (same fields as the personal-account version)
- `followsCount` / `follower_growth` metrics for pages
- `page_views`, `unique_visitors`

## 5. Instagram polish (nice-to-haves)

- Per-day `time_series` support for `follows_and_unfollows` (currently only `total_value`). Would let us draw the Meta-style follows-per-day sparkline.
- A `follower_count` metric returning the running daily total (saves us from having to interpolate from `/accounts/follower-stats`).

## 6. Shape we'd love across all of the above

Matching what IG already returns would be ideal:

```json
{
  "success": true,
  "accountId": "…",
  "platform": "facebook",
  "metricType": "total_value",
  "dateRange": { "since": "2026-03-26", "until": "2026-04-23" },
  "metrics": {
    "page_fan_adds": { "total": 29 },
    "page_fan_removes": { "total": 12 },
    "page_impressions": { "total": 48230 },
    "page_impressions_unique": { "total": 31450 },
    ...
  },
  "dataDelay": "Data may be delayed up to 48 hours"
}
```

That's the contract our code already knows how to consume.

## Why this matters for us

We run analytics for 22 agencies. On the Analytics page today, Instagram rows match Meta Business Suite exactly ("Follows: 44" / "Views: 100.8K" / "Reach: 62K"). Facebook rows still show net-only numbers ("+1" instead of "29 follows / 12 unfollows") because the data just isn't reachable through the API. Agencies compare our dashboard side-by-side with native tools; any discrepancy reads as "your tool is broken" even when the underlying numbers are correct-but-different metrics.

Closing these gaps would make Zernio a true one-stop shop for social analytics across our stack. Happy to jump on a call to talk through priorities.

Thanks,
Jack
