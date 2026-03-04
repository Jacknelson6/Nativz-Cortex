# PRD: Social Media Reporting Dashboard

## Introduction

Unified reporting dashboard that aggregates performance data from Instagram, TikTok, Facebook, and YouTube Shorts into a single, clean interface. The team currently has to jump between four different platform dashboards to understand how a client's content is performing. This feature pulls all metrics into one place with two core actions: generate cumulative performance reports for any date range, and surface the top-winning posts of any period.

## Goals

- Aggregate views, follows, and engagement data from Instagram, TikTok, Facebook, and YouTube Shorts in one dashboard
- Provide date-range-based cumulative reporting across all platforms
- Surface top-performing posts for any time period with configurable count
- Cache platform data in Supabase for fast queries and historical trend analysis
- Deliver a polished, cohesive UI using shadcn components that matches the existing dark theme

## User Stories

### US-001: Create reporting database tables
**Description:** As a developer, I need database tables to store platform metrics snapshots and post performance data so we can query historical data without hitting APIs every time.

**Acceptance Criteria:**
- [ ] Create `platform_snapshots` table storing daily follower count, total views, total engagement per platform per client
- [ ] Create `post_metrics` table storing per-post performance (views, likes, comments, shares, saves, reach)
- [ ] Both tables reference `social_profiles` and `clients` tables with proper foreign keys
- [ ] RLS policies enabled, indexes on `client_id`, `platform`, `snapshot_date`
- [ ] Migration follows naming convention: `021_create_reporting_tables.sql`
- [ ] Typecheck passes

### US-002: Build Nango integrations for each platform's analytics API
**Description:** As a developer, I need to fetch analytics data from Instagram, TikTok, Facebook, and YouTube via Nango so we can populate our reporting tables.

**Acceptance Criteria:**
- [ ] Extend Nango client with functions for each platform: `fetchInstagramInsights()`, `fetchTikTokInsights()`, `fetchFacebookInsights()`, `fetchYouTubeInsights()`
- [ ] Each function accepts a `nangoConnectionId`, `dateRange` (start/end), and returns a normalized shape: `{ followers, views, likes, comments, shares, saves, engagementRate, posts[] }`
- [ ] Handle rate limits and API errors gracefully with retries
- [ ] Null-safe responses (`?? 0`, `?? []`)
- [ ] Typecheck passes

### US-003: Create data sync API route
**Description:** As a developer, I need an API endpoint that fetches fresh data from all connected platforms for a client and upserts it into the reporting tables.

**Acceptance Criteria:**
- [ ] `POST /api/reporting/sync` accepts `{ clientId, dateRange }` with Zod validation
- [ ] Auth check before processing
- [ ] Fetches data from all active `social_profiles` for the client
- [ ] Upserts daily snapshots into `platform_snapshots`
- [ ] Upserts individual post metrics into `post_metrics`
- [ ] Returns `{ synced: true, platforms: string[], postsCount: number }`
- [ ] Typecheck passes

### US-004: Build cumulative report API route
**Description:** As a team member, I want to fetch aggregated metrics across all platforms for a date range so I can see total performance at a glance.

**Acceptance Criteria:**
- [ ] `GET /api/reporting/summary?clientId=X&start=YYYY-MM-DD&end=YYYY-MM-DD` with Zod validation
- [ ] Returns per-platform breakdown: `{ platform, followers, followerChange, totalViews, totalEngagement, engagementRate, postsCount }`
- [ ] Returns combined totals across all platforms
- [ ] Includes period-over-period comparison (e.g., if querying 30 days, compare to previous 30 days) with `change` percentages
- [ ] Auth check before processing
- [ ] Typecheck passes

### US-005: Build top posts API route
**Description:** As a team member, I want to find the top-performing posts across all platforms for a date range so I can identify winning content.

**Acceptance Criteria:**
- [ ] `GET /api/reporting/top-posts?clientId=X&start=YYYY-MM-DD&end=YYYY-MM-DD&limit=3` with Zod validation
- [ ] Ranks posts by total engagement (likes + comments + shares + saves)
- [ ] Returns post details: platform, thumbnail, caption preview, engagement breakdown, post URL, published date
- [ ] Supports configurable `limit` parameter (default 3)
- [ ] Auth check before processing
- [ ] Typecheck passes

### US-006: Build reporting dashboard page layout
**Description:** As a team member, I want a clean reporting page with a client selector and quick-action buttons so I can quickly generate the reports I need.

**Acceptance Criteria:**
- [ ] New page at `/admin/reporting`
- [ ] Client selector dropdown at the top (populated from active clients)
- [ ] Two quick-action pill buttons: "Performance summary" and "Top posts"
- [ ] Date range selector with presets: "Past 7 days", "Past 30 days", "Month to date", "Year to date", custom range
- [ ] Loading skeleton states while data fetches
- [ ] Empty state when no client selected or no data available
- [ ] Matches existing dark theme (`bg-background`, `bg-surface` cards, `accent-text`)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Build performance summary view
**Description:** As a team member, I want to see cumulative metrics displayed as stat cards with per-platform breakdowns so I can understand overall performance at a glance.

**Acceptance Criteria:**
- [ ] Top row: 4 `StatCard` components showing combined totals — Total views, Total followers gained, Total engagement, Average engagement rate
- [ ] Each stat card shows period-over-period change percentage with trend arrow
- [ ] Below stat cards: platform breakdown table showing each platform's individual metrics in a clean grid
- [ ] Platform rows show platform icon, name, followers, views, engagement, engagement rate
- [ ] Responsive layout — cards stack on mobile
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Build top posts view
**Description:** As a team member, I want to see the winning posts displayed as rich cards so I can quickly identify what content performs best.

**Acceptance Criteria:**
- [ ] Configurable post count selector (top 3, 5, or 10)
- [ ] Each post card shows: platform badge, thumbnail/preview image, caption (truncated to 2 lines), published date
- [ ] Engagement breakdown on each card: views, likes, comments, shares, saves
- [ ] Click card to open original post URL in new tab
- [ ] Cards rank-ordered with position indicator (#1, #2, #3)
- [ ] Responsive grid — 1 column on mobile, 2 on tablet, 3 on desktop
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Add reporting link to admin sidebar
**Description:** As a team member, I want to access the reporting dashboard from the sidebar navigation.

**Acceptance Criteria:**
- [ ] Add "Reporting" item to admin sidebar with `BarChart3` icon (or similar)
- [ ] Links to `/admin/reporting`
- [ ] Active state highlights correctly when on reporting page
- [ ] Position it logically near the existing Analytics item
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-010: Add scheduled data sync via cron
**Description:** As a developer, I need platform data to sync automatically so the reporting dashboard always has fresh data without manual syncing.

**Acceptance Criteria:**
- [ ] Cron API route at `POST /api/cron/sync-reporting` (Vercel cron compatible)
- [ ] Iterates all active clients with connected social profiles
- [ ] Syncs the last 7 days of data for each client (rolling window)
- [ ] Logs sync results to console
- [ ] Add cron schedule to `vercel.json` (daily at 6 AM UTC)
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Store daily platform snapshots (followers, views, engagement) per client per platform in `platform_snapshots` table
- FR-2: Store individual post metrics (views, likes, comments, shares, saves, reach) in `post_metrics` table
- FR-3: Fetch analytics data from Instagram Graph API, TikTok Business API, Facebook Page Insights API, and YouTube Data API via Nango OAuth
- FR-4: Normalize all platform responses into a consistent data shape before storage
- FR-5: Provide date range presets: past 7 days, past 30 days, month to date, year to date, custom
- FR-6: Calculate period-over-period change percentages for all summary metrics
- FR-7: Rank posts by total engagement (likes + comments + shares + saves) for top posts view
- FR-8: Allow configurable top post count (3, 5, or 10)
- FR-9: Display platform icons/badges to visually distinguish data sources
- FR-10: Support manual "Sync now" button on the dashboard to trigger fresh data pull
- FR-11: Run automated daily sync via Vercel cron to keep data current
- FR-12: Show last synced timestamp on the dashboard so users know data freshness

## Non-Goals

- No client portal access — admin team only for V1
- No PDF/export functionality — view in dashboard only
- No competitor benchmarking or comparison
- No content recommendations or AI analysis of why posts performed well
- No real-time streaming data — snapshot-based approach
- No Stories/Reels-specific breakdowns (aggregate video metrics only)
- No ad/paid performance tracking — organic only

## Design Considerations

- Reuse existing `StatCard` component for summary metrics
- Use shadcn `Select` for client picker and date range presets
- Use shadcn `Card` for post cards with platform-specific accent colors
- Platform color coding: Instagram (gradient pink/purple), TikTok (black/teal), Facebook (blue), YouTube (red)
- Date range picker: shadcn-style popover with calendar for custom ranges, pill buttons for presets
- Quick-action buttons at top should feel like toggleable tabs/pills, not navigation — both views live on the same page
- Loading states: use existing `Skeleton` component
- Consider Recharts `BarChart` for optional engagement comparison chart across platforms

## Technical Considerations

- **Nango integration:** Extend existing `/lib/nango/client.ts` — each platform needs its own API endpoint mapping. Instagram and Facebook share Meta's Graph API. TikTok and YouTube have separate APIs.
- **Rate limits:** Instagram/Facebook: 200 calls/hour per user. TikTok: 1000/day. YouTube: 10,000 quota units/day. Caching in Supabase avoids hitting these on every page load.
- **Data normalization:** Each platform returns metrics differently. Create a normalization layer (`lib/reporting/normalizers/`) that maps raw API responses to our unified schema.
- **Existing tables:** The `social_profiles` table already stores connected accounts with `platform` and `platform_user_id`. The `meta_page_snapshots` and `meta_posts` tables exist for Meta data — consider whether to extend these or create new unified tables. Recommendation: new unified tables for consistency across all 4 platforms.
- **Deduplication:** Use `UPSERT` (ON CONFLICT) with `(social_profile_id, snapshot_date)` for snapshots and `(external_post_id, platform)` for post metrics to prevent duplicate entries.
- **Performance:** Index on `(client_id, snapshot_date)` for fast date range queries. Partition consideration if data grows large.

## Success Metrics

- Team can generate a cross-platform performance summary in under 3 clicks (select client → pick range → view)
- Dashboard loads cached data in under 2 seconds
- Data freshness: metrics no more than 24 hours old via daily cron sync
- All 4 platforms reporting data accurately with <5% variance from native dashboards
- Team stops needing to log into individual platform dashboards for routine reporting

## Open Questions

- Should we deduplicate posts that are cross-posted to multiple platforms, or show them as separate entries in top posts?
- What Nango integration IDs are needed for TikTok and YouTube? (Currently only Google Calendar is configured)
- Do we want a "Sync now" button on the dashboard, or rely entirely on the daily cron?
- Should the date range picker allow ranges longer than 1 year, or cap it?
- For YouTube, should we track Shorts-only metrics, or all video types?
