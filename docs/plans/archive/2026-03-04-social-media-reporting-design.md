# Design: Social Media Reporting Dashboard

## Overview

Replace the current `/admin/analytics` page (Cortex platform metrics) with a unified social media reporting dashboard. Aggregates Instagram, TikTok, Facebook, and YouTube Shorts data into one clean interface with two core actions: cumulative performance summaries and top-winning post discovery.

## Architecture

### Routing

- **Page:** `/admin/analytics` (replaces existing page entirely)
- **Sidebar:** Keep existing "Analytics" nav item with `BarChart3` icon — no changes needed
- **URL state:** Client, date range, and active view stored in search params (e.g. `?client=uuid&range=30d&view=summary`)

### Database

Two new tables. Both reference the existing `social_profiles` table (already has all 4 platforms).

**`platform_snapshots`** — daily aggregate metrics per social profile:
```
id uuid PK
social_profile_id uuid FK → social_profiles(id) ON DELETE CASCADE
client_id uuid FK → clients(id) ON DELETE CASCADE
snapshot_date date NOT NULL
followers_count integer DEFAULT 0
followers_change integer DEFAULT 0
views_count integer DEFAULT 0
engagement_count integer DEFAULT 0  (likes + comments + shares + saves)
engagement_rate numeric
posts_count integer DEFAULT 0
created_at timestamptz DEFAULT now()
UNIQUE(social_profile_id, snapshot_date)
```

**`post_metrics`** — per-post performance data:
```
id uuid PK
social_profile_id uuid FK → social_profiles(id) ON DELETE CASCADE
client_id uuid FK → clients(id) ON DELETE CASCADE
platform text NOT NULL (facebook | instagram | tiktok | youtube)
external_post_id text NOT NULL
post_url text
thumbnail_url text
caption text
post_type text (video | image | reel | short | carousel)
published_at timestamptz
views_count integer DEFAULT 0
likes_count integer DEFAULT 0
comments_count integer DEFAULT 0
shares_count integer DEFAULT 0
saves_count integer DEFAULT 0
reach_count integer DEFAULT 0
engagement_rate numeric
fetched_at timestamptz DEFAULT now()
UNIQUE(external_post_id, platform)
```

Indexes on: `(client_id, snapshot_date)`, `(client_id, platform, published_at)`, `(social_profile_id)`.

### Data Layer — `lib/reporting/`

```
lib/reporting/
  types.ts          — Normalized types (PlatformInsights, PostMetric, SummaryReport, TopPost)
  client.ts         — Main reporting client: fetchSummary(), fetchTopPosts(), syncPlatformData()
  normalizers/
    instagram.ts    — Maps Instagram Graph API → normalized shape
    facebook.ts     — Maps Facebook Page Insights → normalized shape
    tiktok.ts       — Maps TikTok Business API → normalized shape
    youtube.ts      — Maps YouTube Data API → normalized shape
  sync.ts           — Orchestrates fetching from all connected platforms and upserting to DB
```

**Normalizer interface** (each platform implements this):
```typescript
interface PlatformNormalizer {
  fetchInsights(connectionId: string, dateRange: DateRange): Promise<NormalizedInsights>
  fetchPosts(connectionId: string, dateRange: DateRange): Promise<NormalizedPost[]>
}

interface NormalizedInsights {
  followers: number
  followersChange: number
  views: number
  engagement: number
  engagementRate: number
  postsCount: number
}

interface NormalizedPost {
  externalPostId: string
  postUrl: string | null
  thumbnailUrl: string | null
  caption: string | null
  postType: string
  publishedAt: string
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  reach: number
}
```

Each normalizer calls Nango's proxy (`nango.get()`) with the platform-specific API endpoint and maps the response. Platforms are added incrementally — if a normalizer isn't implemented yet, it's skipped during sync.

### Nango Integration

Extend existing `lib/nango/client.ts` pattern. Each platform needs a separate Nango integration (provider config key):
- `instagram-business` — Instagram Graph API
- `facebook-pages` — Facebook Page Insights
- `tiktok-business` — TikTok Business API
- `youtube-analytics` — YouTube Data API

These get configured in the Nango dashboard. The `social_profiles` table already stores `access_token_ref` which maps to the Nango connection ID per profile.

### API Routes

**`POST /api/reporting/sync`**
- Body: `{ clientId: string, dateRange?: { start: string, end: string } }`
- Fetches data from all active social profiles for the client
- Upserts into `platform_snapshots` and `post_metrics`
- Returns `{ synced: true, platforms: string[], postsCount: number }`

**`GET /api/reporting/summary`**
- Params: `clientId`, `start`, `end`
- Queries `platform_snapshots` for the date range
- Returns per-platform breakdown + combined totals + period-over-period change %

**`GET /api/reporting/top-posts`**
- Params: `clientId`, `start`, `end`, `limit` (default 3)
- Queries `post_metrics` ordered by total engagement DESC
- Returns ranked post cards with full engagement breakdown

### UI Components

```
components/reporting/
  analytics-dashboard.tsx    — Main client component (replaces entire analytics page)
  hooks/
    use-reporting-data.ts    — SWR hook for summary + top posts data
  summary-view.tsx           — StatCards + platform breakdown table
  top-posts-view.tsx         — Ranked post cards grid
  date-range-picker.tsx      — Preset pills + custom range popover
  platform-badge.tsx         — Colored platform icon badges
```

**Page layout:**
1. **Header row:** Page title + client selector dropdown + "Sync now" button
2. **Controls row:** Date range presets (pills: 7d / 30d / MTD / YTD / Custom) + view toggle (Summary | Top posts)
3. **Content area:** Switches between summary view and top posts view

**Summary view:**
- 4 StatCards across the top: Total views, Followers gained, Total engagement, Avg engagement rate
- Each card shows period-over-period change % with trend arrow (reuses existing `StatCard`)
- Below: platform breakdown table — rows for each connected platform with icon, name, followers, views, engagement, rate

**Top posts view:**
- Count selector (top 3 / 5 / 10) as small pill toggle
- Grid of post cards (1 col mobile, 2 tablet, 3 desktop)
- Each card: rank badge (#1, #2, #3), platform badge, thumbnail, caption (2-line truncate with gradient fade — pattern #31), published date, engagement breakdown (views, likes, comments, shares, saves)
- Click opens original post URL in new tab

### Design Patterns Applied

- **#4 Stagger for event order** — stat cards and post cards animate in with staggered delay
- **#21 Keep state in URL** — client, date range, view mode all in search params
- **#28 Outer and inner border radius** — post cards with nested metric badges
- **#31 Text overflow cutoff** — caption truncation with gradient fade
- **#33 CSS text-box trim** — stat card numbers aligned precisely
- **#36 Dynamic visual guideline** — platform breakdown table rows with hover highlight

### Cron Sync

**`POST /api/cron/sync-reporting`** (Vercel cron, daily 6 AM UTC)
- Iterates all active clients with connected social profiles
- Syncs last 7 days rolling window
- Added to `vercel.json` cron config

## Non-Goals

- No client portal access (admin only)
- No PDF/export
- No competitor benchmarking
- No AI analysis of post performance
- No Stories/Reels-specific breakdown
- No ad/paid tracking

## Phasing

**Phase 1 (this build):** Full UI + database + API routes + sync infrastructure. Wire up whichever Nango integrations are already configured. Dashboard works with whatever data is available.

**Phase 2 (follow-up):** Configure remaining Nango integrations in Nango dashboard, implement remaining normalizers.
