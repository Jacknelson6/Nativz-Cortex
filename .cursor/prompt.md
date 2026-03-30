# Cortex UI Refinement + Scraper Fix

## Problem 1: Only YouTube is returning videos (TikTok + Instagram return 0)

The scraper orchestration in `lib/scrapers/scrape-all.ts` tries a local scraper service first (localhost:3200), then falls back to Apify. The local scraper may not be responding correctly, and the Apify fallback may not be triggering.

### Debug steps:
1. Check `lib/scrapers/tiktok-scraper.ts` — does it correctly call the Apify actor `clockworks/free-tiktok-scraper`?
2. Check `lib/scrapers/instagram-scraper.ts` — does it correctly call `apify/instagram-scraper`?
3. In `lib/scrapers/scrape-all.ts`, the `scrapeLocal()` function calls `localhost:3200/scrape/{platform}`. If local returns an error, it should fall back to Apify — but the `.then()` chain may swallow errors. Fix: wrap in try/catch so Apify fallback always fires when local fails.
4. The `APIFY_API_KEY` env var must be set. Verify it's referenced correctly.
5. Add better logging so we can see which path (local vs Apify) was attempted and what happened.

### Fix the fallback chain in scrape-all.ts:
```typescript
// Current (broken — .then doesn't catch network errors):
scrapeLocal('tiktok', query, maxResultsPerPlatform, timeRange)
  .then(r => r.error && process.env.APIFY_API_KEY ? scrapeTikTok(...) : r)

// Fixed (catches all failures):
scrapeLocal('tiktok', query, maxResultsPerPlatform, timeRange)
  .catch(() => ({ platform: 'tiktok' as const, videos: [], error: 'Local scraper failed' }))
  .then(r => r.error && process.env.APIFY_API_KEY ? scrapeTikTok(...) : r)
```

Do this for both TikTok and Instagram.

## Problem 2: UI layout has repeated values and illogical ordering

The shared search results page (`components/results/scraped-videos-section.tsx`) renders multiple components that duplicate data.

### Current order (messy):
- Video grid (with its own stats)
- Outlier board (repeats video counts)
- Hook patterns
- Search stats row (repeats counts again)
- Hashtag cloud
- Views over time chart
- Various sections with overlapping metrics

### Desired order (logical flow):
1. **Search stats row** (top) — single source of truth for Videos, Views, Avg Views, Creators, Hashtags
2. **Most Viral carousel** — horizontal scroll of top videos sorted by views
3. **Video grid** (with platform filter tabs) — all videos, filterable. Remove any duplicate stats from this component since stats row handles it.
4. **Outlier creators table** — creators with disproportionate viral content
5. **Hook patterns** — extracted patterns from video hooks
6. **Popular hashtags cloud**
7. **Views over time chart**

### Files to modify:
- `components/results/scraped-videos-section.tsx` — reorder the rendered sections
- `components/research/video-grid.tsx` — remove the inline stats summary since SearchStatsRow now handles it
- Ensure no component renders total video count, total views, etc. if SearchStatsRow already shows it

## Design constraints:
- Dark theme, bg-surface cards, border-nativz-border
- Sentence case for all labels
- Pink/magenta accent for selected states and badges
- Green for view count badges

## Build requirement:
- `npm run build` must pass with zero errors
- Commit with descriptive message and push to main
