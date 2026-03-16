# Topic Search v2 — Multi-Platform Social Intelligence

## Executive Summary

Upgrade Nativz Cortex Topic Search from a single-source Brave Search wrapper into a multi-platform social intelligence engine. v2 pulls real social data from Reddit, YouTube, TikTok, and the web — giving users 200+ real posts, comments, and videos per search instead of ~35 web snippets. Users select which platforms to search, set date ranges, and get platform-aware analysis that feeds directly into the existing video ideation pipeline.

**Why now:** The current search is limited to Brave web results — no actual social posts, no comment threads, no real engagement data. Competitors like BuzzAbout.ai charge $49-149/mo for this. We already have the downstream pipeline (video ideas, moodboard, content pillars). We just need better upstream data.

## Problem Statement

**Current limitations:**
- Single data source (Brave Search API) returns ~35 web snippets
- No real social platform data — just web pages that mention the topic
- No actual Reddit threads, TikTok comments, or YouTube discussions
- "Discussion" results are just forum links, not actual post content
- Video results are metadata only — no engagement data or comments
- Users can't select which platforms to search
- No volume control (always ~35 results)

**What's needed:**
- Real platform data from Reddit (threads + comments), YouTube (videos + comments), TikTok (videos + comments)
- 200+ results per search with actual post content
- Platform multi-select so users choose where to search
- Date range filtering that works per-platform
- Volume toggle (quick 50 results vs deep 200+ results)
- Platform badges on results so users know where data came from

## Goals & Non-Goals

### Goals
- Pull real Reddit posts + comments via Reddit API (free, 100 req/min)
- Pull real YouTube videos + comments via YouTube Data API (free, 10K units/day)
- Pull TikTok video metadata + comments via Apify actors
- Keep Brave Search as the web/news data layer
- Platform multi-select picker in search form
- Date range filtering per platform
- 200+ results per search (vs ~35 today)
- Platform-aware AI analysis (sentiment by platform, engagement patterns)
- Enhanced video ideation grounded in actual viral content
- Backward compatible — old v1 searches render unchanged

### Non-Goals
- Real-time monitoring / alerts (future)
- Instagram search (no public search API)
- X/Twitter search (API costs prohibitive)
- LinkedIn search (no API for post search)
- Content scheduling from search results (already exists elsewhere)
- Building a BuzzAbout competitor product — this is an internal tool enhancement

## Architecture

### Current Flow (v1)
```
User query → Brave Search (3 parallel: web, discussions, videos)
           → ~35 results as SERP data
           → Single Claude AI call with SERP context
           → Structured JSON response (topics, sentiment, ideas)
           → Store in topic_searches table
```

### Proposed Flow (v2)
```
User query + platform selection
  → Platform Router (parallel execution):
     ├─ Reddit API      → threads + comments (50-100 posts)
     ├─ YouTube Data API → videos + comments (20-50 videos)
     ├─ Apify/TikTok    → videos + comments (20-50 videos)
     └─ Brave Search    → web + news (15-30 results)
  → Aggregation layer (normalize all sources to common shape)
  → Pre-processing (cluster by subtopic, rank by engagement)
  → AI Analysis (Claude with 200+ results context)
     ├─ Phase 1: Summarize & cluster (reduce to key themes)
     └─ Phase 2: Deep analysis (sentiment, trends, video ideas)
  → Store expanded results in topic_searches table
  → Trigger downstream integrations
```

## Data Sources

### Reddit (Phase 1 — free, ship first)

| Detail | Value |
|--------|-------|
| **API** | Reddit JSON API (`reddit.com/search.json`) |
| **Auth** | No auth needed for public search (rate limited by IP) |
| **Rate limits** | ~60 req/min unauthenticated, 100 req/min with OAuth |
| **Data pulled** | Posts (title, selftext, score, num_comments, url, subreddit, created_utc), top comments per post |
| **Date filtering** | `t=week`, `t=month`, `t=year`, `t=all` |
| **Volume per search** | 50-100 posts + top 5 comments each = 300-600 content items |
| **Cost per search** | Free |
| **Fallback** | Brave discussions results (current behavior) |

**Implementation:**
```typescript
// lib/reddit/client.ts
interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
  url: string;
  permalink: string;
  subreddit: string;
  created_utc: number;
  author: string;
  top_comments: RedditComment[];
}

interface RedditComment {
  id: string;
  body: string;
  score: number;
  author: string;
  created_utc: number;
}

async function searchReddit(query: string, timeRange: string, limit: number): Promise<RedditPost[]>
async function fetchTopComments(permalink: string, limit: number): Promise<RedditComment[]>
```

### YouTube (Phase 2)

| Detail | Value |
|--------|-------|
| **API** | YouTube Data API v3 |
| **Auth** | GCP API key |
| **Rate limits** | 10,000 quota units/day (search = 100 units, commentThreads = 1 unit) |
| **Data pulled** | Videos (title, description, viewCount, likeCount, commentCount, publishedAt, channelTitle), comments (textDisplay, likeCount, publishedAt) |
| **Date filtering** | `publishedAfter` ISO date param |
| **Volume per search** | 20-50 videos + top 10 comments each = 220-550 content items |
| **Cost per search** | ~200 quota units (2% of daily free quota) |
| **Fallback** | Brave video results (current behavior) |

**Implementation:**
```typescript
// lib/youtube/search.ts
interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
  top_comments: YouTubeComment[];
}

interface YouTubeComment {
  id: string;
  text: string;
  likeCount: number;
  authorName: string;
  publishedAt: string;
}

async function searchYouTube(query: string, publishedAfter: string, maxResults: number): Promise<YouTubeVideo[]>
async function fetchVideoComments(videoId: string, maxResults: number): Promise<YouTubeComment[]>
```

### TikTok (Phase 3 — Apify)

| Detail | Value |
|--------|-------|
| **API** | Apify actor `clockworks/tiktok-scraper` |
| **Auth** | Apify API key |
| **Rate limits** | Depends on Apify plan (free tier: limited) |
| **Data pulled** | Videos (desc, stats, music, author, hashtags), comments |
| **Date filtering** | Post-fetch filtering by `createTime` |
| **Volume per search** | 20-50 videos + comments |
| **Cost per search** | ~$0.01-0.05 depending on volume |
| **Fallback** | Brave video results filtered to TikTok |

**Implementation:**
```typescript
// lib/tiktok/search.ts
interface TikTokSearchResult {
  id: string;
  desc: string;
  author: { uniqueId: string; nickname: string };
  stats: { playCount: number; diggCount: number; commentCount: number; shareCount: number };
  createTime: number;
  music: { title: string; authorName: string } | null;
  hashtags: string[];
  top_comments: TikTokComment[];
}

interface TikTokComment {
  text: string;
  diggCount: number;
  createTime: number;
  user: { uniqueId: string };
}

async function searchTikTok(query: string, maxResults: number): Promise<TikTokSearchResult[]>
```

### Brave Search (enhanced, always included)

Keep current implementation but expand:
- Increase web results from 15 → 25
- Increase discussion results from 10 → 20
- Increase video results from 10 → 20
- Total: ~65 web results (up from ~35)

## Data Model Changes

### New TypeScript Types

```typescript
// lib/types/search.ts additions

type SearchPlatform = 'reddit' | 'youtube' | 'tiktok' | 'web';

interface PlatformSource {
  platform: SearchPlatform;
  id: string;
  url: string;
  title: string;
  content: string;              // Post body or video description
  author: string;
  engagement: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    score?: number;             // Reddit upvotes
  };
  createdAt: string;            // ISO date
  comments: PlatformComment[];  // Top comments
  metadata?: Record<string, unknown>;
}

interface PlatformComment {
  id: string;
  text: string;
  author: string;
  likes: number;
  createdAt: string;
}

interface SearchV2Config {
  platforms: SearchPlatform[];   // User-selected platforms
  volume: 'quick' | 'deep';    // 50 vs 200+ results
  timeRange: string;            // 7d, 30d, 90d, all
}

// Extended TopicSearchAIResponse — backward compatible
interface TopicSearchAIResponse {
  // ... existing fields unchanged ...

  // v2 additions
  platform_breakdown?: {
    platform: SearchPlatform;
    post_count: number;
    comment_count: number;
    avg_sentiment: number;
    top_subreddits?: string[];     // Reddit-specific
    top_channels?: string[];       // YouTube-specific
    top_hashtags?: string[];       // TikTok-specific
  }[];
  conversation_themes?: {
    theme: string;
    post_count: number;
    sentiment: number;
    platforms: SearchPlatform[];
    representative_quotes: string[];
  }[];
}
```

### Database Migration

```sql
-- Add v2 fields to topic_searches
ALTER TABLE topic_searches
  ADD COLUMN IF NOT EXISTS platforms TEXT[] DEFAULT ARRAY['web'],
  ADD COLUMN IF NOT EXISTS search_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS platform_data JSONB,
  ADD COLUMN IF NOT EXISTS volume TEXT DEFAULT 'quick';

COMMENT ON COLUMN topic_searches.platforms IS 'Platforms searched: reddit, youtube, tiktok, web';
COMMENT ON COLUMN topic_searches.search_version IS '1 = Brave-only, 2 = multi-platform';
COMMENT ON COLUMN topic_searches.platform_data IS 'Raw platform results before AI processing';
COMMENT ON COLUMN topic_searches.volume IS 'quick (50 results) or deep (200+)';
```

## API Changes

### Platform Router

```typescript
// lib/search/platform-router.ts

interface PlatformResults {
  reddit: PlatformSource[];
  youtube: PlatformSource[];
  tiktok: PlatformSource[];
  web: PlatformSource[];
}

async function gatherPlatformData(
  query: string,
  platforms: SearchPlatform[],
  timeRange: string,
  volume: 'quick' | 'deep'
): Promise<PlatformResults>
```

The router runs all selected platforms in parallel with individual timeouts and fallbacks. If a platform fails, it degrades gracefully — the search still completes with available data.

### Updated Search API

`POST /api/search` changes:
- Accept `platforms: string[]` in request body (default: `['web']` for backward compat)
- Accept `volume: 'quick' | 'deep'` (default: `'quick'`)
- Call platform router instead of just Brave
- Normalize all results to `PlatformSource[]` before AI call
- Store `platform_data` and `platforms` in the database
- Set `search_version = 2`

## UI Changes

### Search Form
- Replace unused source dropdown with **platform multi-select checkboxes**:
  - ☑ Web (always on, can't disable)
  - ☐ Reddit
  - ☐ YouTube
  - ☐ TikTok
- Add **volume toggle**: Quick (50 results, ~15s) vs Deep (200+ results, ~45s)
- Keep existing: time range, client selector, search mode toggle

### Results Page
- Add **platform badges** to trending topics and sources (Reddit icon, YouTube icon, etc.)
- Add **platform breakdown section** showing data distribution across platforms
- Add **conversation themes** section with representative quotes
- Platform filter on trending topics table

### Processing Page
- Show per-platform progress (Reddit ✓, YouTube loading..., TikTok pending)

## AI Prompt Changes

### Token Budget Management

With 200+ results, we can't send everything raw to Claude. Strategy:

1. **Pre-cluster** results by subtopic using embeddings or keyword overlap
2. **Summarize** each cluster to ~100 words (preserving engagement metrics)
3. **Send** cluster summaries + top 20 highest-engagement raw posts to AI
4. **Total prompt size:** ~8K tokens of context (vs ~4K today)

### Platform-Aware Prompt Additions

```
<platform_data>
## Reddit (47 posts, 312 comments)
Top subreddits: r/skincare, r/beauty, r/DIY
[Cluster summaries with engagement metrics]

## YouTube (23 videos, 178 comments)
Top channels: Hyram, James Welsh, Doctorly
[Video summaries with view counts and comment highlights]

## TikTok (31 videos)
Top hashtags: #skincare, #edibleskincare, #cleanbeauty
[Video descriptions with engagement metrics]

## Web (42 results)
[Standard SERP data]
</platform_data>
```

### Enhanced Video Ideation

The AI prompt now includes actual viral video data — real TikTok/YouTube videos that performed well on the topic. This grounds video ideas in proven content rather than guessing:

```
When generating video ideas, reference the actual top-performing videos found:
- Match hook styles that got high engagement
- Reference trending formats from the platform data
- Include specific hashtags/trends from TikTok data
- Reference successful YouTube video structures
```

## Pipeline Integration

### Search → Video Ideas → Ideas Board
Already works. v2 enhancement: video ideas cite actual platform sources ("inspired by @user's TikTok that got 2.3M views").

### Search → Moodboard
New: "Save to moodboard" button on video results (YouTube/TikTok). Creates moodboard item directly from search results with pre-filled metadata.

### Search → Client Strategy
Already works. v2 enhancement: platform breakdown helps identify where the client's audience actually lives (Reddit-heavy vs TikTok-heavy topics).

### Search → Nerd AI
Already works via search_id context. v2 enhancement: Nerd can reference specific platform data ("According to the Reddit data from your search...").

## Implementation Plan

### Phase 1: Reddit Integration (Week 1)
1. Create `lib/reddit/client.ts` — search + comment fetching
2. Create `lib/search/platform-router.ts` — orchestrates multi-platform
3. Update `lib/types/search.ts` — new types
4. Database migration — add v2 columns
5. Update `POST /api/search` — integrate platform router
6. Update search form — platform checkboxes
7. Update results page — platform badges + breakdown
8. Update AI prompt — platform-aware context

### Phase 2: YouTube Integration (Week 2)
1. Set up YouTube Data API key in GCP
2. Create `lib/youtube/search.ts` — search + comments
3. Wire into platform router
4. Add quota tracking (10K units/day limit)

### Phase 3: TikTok Integration (Week 3)
1. Add `APIFY_API_KEY` env var
2. Create `lib/tiktok/search.ts` — Apify actor integration
3. Wire into platform router
4. Handle async Apify runs (poll for completion)

### Phase 4: Polish (Week 4)
1. Processing page with per-platform progress
2. Platform filters on results
3. "Save to moodboard" from search results
4. Cost tracking per platform

## Cost Analysis

| Platform Combination | Cost per Search | Time |
|---------------------|----------------|------|
| Web only (v1) | ~$0.005 (Brave) | ~15s |
| Web + Reddit | ~$0.005 (Brave) + $0 (Reddit) | ~20s |
| Web + Reddit + YouTube | ~$0.005 + $0 + $0 (API key) | ~25s |
| Web + Reddit + YouTube + TikTok | ~$0.005 + $0 + $0 + ~$0.03 (Apify) | ~40s |
| All platforms, deep mode | ~$0.04 total | ~60s |

AI cost stays the same (~$0 with Hunter Alpha).

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Reddit rate limiting (60 req/min unauthenticated) | Register Reddit OAuth app for 100 req/min; cache results |
| YouTube quota exhaustion (10K units/day) | Track usage; fall back to Brave video results; warn user |
| TikTok Apify actor breaks | Fall back to tikwm.com scraping (existing code) |
| 200+ results exceed Claude context | Pre-cluster and summarize; send cluster summaries not raw data |
| Vercel 300s timeout on deep searches | Show partial results; background-process remaining platforms |
| Platform data format changes | Version platform clients; graceful degradation on parse errors |

## Open Questions

1. Should we cache platform results to avoid re-fetching for similar queries within 24h?
2. Do we want a "compare platforms" view showing sentiment/topic divergence across Reddit vs YouTube vs TikTok?
3. Should the volume toggle (quick/deep) be per-platform or global?
4. Do we want to store raw platform data separately for re-analysis later?
