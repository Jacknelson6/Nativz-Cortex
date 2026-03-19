# PRD: Search Depth Overhaul + Platform Scraping Upgrades

## Problem

The search configuration UI has two issues:
1. **Platforms default to only "Web & news"** — should default to all platforms selected
2. **Depth has only 2 options** (Quick/Deep) with no clarity on what they mean
3. **Platform icons are generic** — should use actual brand logos (Reddit, YouTube, TikTok)
4. **TikTok/YouTube transcription and comments** are limited in volume
5. **No cost-effective path for high-volume TikTok scraping**

## Solution

### 1. Three-Tier Depth System

Replace Quick/Deep with Light/Medium/Deep:

| Depth | Sources | Default? | Description |
|-------|---------|----------|-------------|
| **Light** | 10–20 per platform | No | Fast scan, surface-level trends |
| **Medium** | ~100 per platform | **Yes** | Balanced depth for most research |
| **Deep** | 500+ per platform | No | Comprehensive analysis with full transcripts |

Per-platform breakdown:

| Platform | Light | Medium | Deep |
|----------|-------|--------|------|
| **Web** | 15 results | 30 results | 50 results |
| **Reddit** | 20 posts, 5 w/ comments | 100 posts, 20 w/ comments | 500 posts, 50 w/ comments |
| **YouTube** | 15 videos, 5 w/ comments, 3 transcripts | 100 videos, 30 w/ comments, 20 transcripts | 500 videos, 100 w/ comments, 50 transcripts |
| **TikTok** | 15 videos, 5 w/ comments, 3 transcripts | 100 videos, 30 w/ comments, 15 transcripts | 500 videos, 100 w/ comments, 30 transcripts |

### 2. UI Changes

**Platforms:**
- Default ALL platforms to selected
- Use actual brand SVG logos instead of generic lucide icons
- Reddit: orange Reddit alien logo
- YouTube: red YouTube play button logo
- TikTok: TikTok note logo (black/teal)

**Depth selector:**
- Three buttons: Light / Medium / Deep
- Default to Medium
- Each button has a tooltip or subtitle showing what it means:
  - Light: "~20 sources · Fast scan"
  - Medium: "~100 sources · Recommended"
  - Deep: "500+ sources · Full analysis"
- Hover/click expands details panel showing per-platform breakdown

**Search summary card:**
- Update to show new depth names and source estimates

### 3. YouTube Upgrades

**YouTube API is free and covers our needs.** Current implementation already uses Data API v3 + timedtext API for transcripts. Just scale up the numbers:

- **Quota math for Deep (500 videos):** ~4,000 units out of 10,000/day free quota. Fits.
- **Transcripts:** Already using YouTube's free timedtext API. Scale from 25 to 50.
- **Comments:** Already using commentThreads API. Scale from 40 to 100. Fetch top 100 comments per video.

No architecture changes needed — just adjust the volume constants.

### 4. TikTok Strategy

**Stick with Apify for now.** Building a self-hosted TikTok scraper is tempting but TikTok's anti-bot measures break scrapers every 2-4 weeks. The maintenance burden isn't worth it at current volume.

**Cost at Medium depth (100 videos):** ~$0.50-$2 per search via Apify
**Cost at Deep depth (500 videos):** ~$5-$16 per search via Apify

**Transcript extraction:**
- Already using tikwm.com for TikTok metadata
- For Deep searches, add Whisper transcription via OpenAI API ($0.006/min audio)
- Average TikTok = 30 seconds = $0.003/video
- 30 transcripts at Deep = ~$0.09 per search (negligible)

**Comments:**
- Already using tikwm.com comment API
- Scale up: fetch top 100 comments per video (currently fetches fewer)

**Future: Self-hosted TikTok scraping**
When volume exceeds 2+ TikTok searches/day consistently, evaluate:
- `TikTok-Api` Python library + residential proxies ($50-100/mo)
- Run on Fly.io/Railway as a microservice
- Saves $300+/mo vs Apify at that volume
- But requires 4-8 hrs/month maintenance when TikTok breaks the API

### 5. Volume Constants

Update `lib/search/platform-router.ts` and related files:

```typescript
const VOLUME_CONFIG = {
  light: {
    reddit: { posts: 20, commentPosts: 5 },
    youtube: { videos: 15, commentVideos: 5, transcriptVideos: 3 },
    tiktok: { videos: 15, commentVideos: 5, transcriptVideos: 3 },
    web: { results: 15 },
  },
  medium: {
    reddit: { posts: 100, commentPosts: 20 },
    youtube: { videos: 100, commentVideos: 30, transcriptVideos: 20 },
    tiktok: { videos: 100, commentVideos: 30, transcriptVideos: 15 },
    web: { results: 30 },
  },
  deep: {
    reddit: { posts: 500, commentPosts: 50 },
    youtube: { videos: 500, commentVideos: 100, transcriptVideos: 50 },
    tiktok: { videos: 500, commentVideos: 100, transcriptVideos: 30 },
    web: { results: 50 },
  },
};
```

### 6. Database Changes

Update `topic_searches.volume` to accept `'light' | 'medium' | 'deep'` (currently `'quick' | 'deep'`).
Backward-compatible: treat existing `'quick'` as `'light'` in queries.

## Files to Modify

| File | Changes |
|------|---------|
| `components/search/search-form.tsx` | Default all platforms, 3-tier depth, tooltips, brand logos |
| `components/search/platform-icon.tsx` | Replace lucide icons with brand SVGs |
| `lib/search/platform-router.ts` | New volume configs for light/medium/deep |
| `lib/reddit/client.ts` | Adjust volume constants |
| `lib/youtube/search.ts` | Adjust volume constants, increase comment/transcript limits |
| `lib/tiktok/search.ts` | Adjust volume constants, increase comment limits |
| `lib/types/search.ts` | Update SearchVolume type |
| `app/api/search/start/route.ts` | Accept new volume values |
| `app/api/search/[id]/process/route.ts` | Map volume to platform configs |

## Non-goals

- Self-hosted TikTok scraper (future consideration, not now)
- Self-hosted YouTube scraper (official API is free and sufficient)
- Whisper self-hosting (OpenAI API is cheap enough at $0.003/video)
- Changing the AI analysis prompt structure
