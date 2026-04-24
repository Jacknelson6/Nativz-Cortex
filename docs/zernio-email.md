# Email to Zernio

**To:** support@zernio.com (or your account manager)
**Subject:** Feature request — analytics parity across Facebook / TikTok / YouTube / LinkedIn

---

Hey team,

First — the Instagram account-insights endpoint is exactly right. `metrics=follows_and_unfollows` with `breakdown=follow_type`, plus account-wide `views` / `reach` / `accounts_engaged` / `total_interactions` as `total_value` totals — that gave us near-perfect parity with Meta Business Suite. Nice work on that one.

We're building a polished analytics dashboard for our agency (Nativz Cortex — 22 clients posting through Zernio), and we're running into gaps on the non-IG surfaces. Would love to see these closed so we can stay on Zernio end-to-end rather than building direct platform integrations.

Ordered by impact for our client base:

### 1. Facebook page-insights (all 22 of our clients)

Need a `/v1/analytics/facebook/page-insights` endpoint mirroring the IG one. Meta Graph exposes everything; we just can't reach it without the page access token, which is in your system.

Priority metrics:
- `page_fan_adds` (gross new follows — this is the #1 ask)
- `page_fan_removes`
- `page_impressions` + `page_impressions_unique` (reach)
- `page_views_total`
- `page_post_engagements`
- `page_video_views`, `page_video_view_time`

Window totals via `metricType=total_value` would already unblock us — `time_series` is a nice-to-have.

### 2. TikTok account-insights (19 clients)

Need a `/v1/analytics/tiktok/account-insights` endpoint. Your standard `/analytics` currently returns `0` for `impressions` / `reach` on TikTok accounts because those live on TikTok's Research API, not the standard one.

Priority metrics:
- `video_views` (account-wide window total)
- `profile_views`
- `follower_count` gross breakdown
- Account aggregates for likes / comments / shares

Per-video detail (equivalent to your existing YT `/analytics/youtube/daily-views`):
- `video_view_total_time` (total watch time)
- `average_time_watched`
- `full_video_watched_rate` (completion)
- `impression_source` breakdown (For You / following / hashtag / search)

### 3. YouTube channel-insights aggregate (11 clients)

Your per-video `/analytics/youtube/daily-views?videoId=X` is great, but today we loop through every video in the channel to assemble account-level totals. A `/v1/analytics/youtube/channel-insights` endpoint that returns channel-wide aggregates directly would replace dozens of per-video round-trips per sync.

Priority metrics (window totals + daily time series):
- `views`, `estimatedMinutesWatched`, `averageViewDuration`
- `subscribersGained` + `subscribersLost` (gross)
- `impressions` + `impressionsClickThroughRate`

All in the YouTube Analytics API v2 `reports` endpoint.

### 4. LinkedIn organization-page analytics (4 clients)

`/v1/accounts/{id}/linkedin-aggregate-analytics` is documented as personal-account-only, and we get `organization_not_supported` 400s on every one of our accounts (all 4 are company pages, not personal). Could the endpoint be extended to org pages, or a parallel endpoint added? Same metric set would be ideal.

### 5. Instagram polish

- Per-day `time_series` support for `follows_and_unfollows` (currently `total_value` only). Would let us chart the MBS-style follows-per-day sparkline.
- A `follower_count` metric returning the running daily total (saves us interpolating from `/accounts/follower-stats`).

### Response shape

Matching what IG returns would be ideal — our code already knows how to consume it:

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
    ...
  }
}
```

---

Happy to hop on a call about priorities or scope. We're actively shipping on top of Zernio and these gaps are the only things blocking a truly polished experience across every connected platform.

Thanks,
Jack
Nativz Cortex
