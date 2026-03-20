# Search Results Overhaul PRD

## Problems Identified

### Data Quality Issues
1. **URL artifacts in topics** — "Https Www" appearing as a trending topic because the analytics engine extracts bigrams from URLs
2. **Generic format topics** — "Food Shorts", "Shorts Viral" are format descriptors, not useful topics. The search is about short-form content so these are obvious/redundant
3. **Topic score always 100** — Algorithm is too generous, not discriminating. Needs redesign to be informative
4. **Sentiment "Mixed" when 0.9** — Should say "Positive" or show percentage, not "Mixed" when sentiment is clearly positive
5. **Trending topics are script-extracted bigrams** — Too mechanical. Need LLM-powered topic analysis that understands context and nuance
6. **TikTok showing 0 posts/0 comments** — Apify integration failing silently
7. **Web showing 0 posts** — Brave results not being counted correctly in platform stats
8. **Quora only 10 results** — Too light for a platform, need more depth

### UI/UX Issues
9. **Remove top-level stats clutter** — "8 trending topics, 8 high-resonance" badges are noise at the top
10. **Platform breakdown too detailed at top** — Replace with compact source count per platform
11. **Remove conversation themes** — Not helpful information
12. **Sentiment numbers shown raw** — Show as percentage/label instead of decimals
13. **No visual embeds** — No thumbnails for TikTok, Reddit, YouTube content
14. **No source browser** — Can't see actual posts, comments, transcripts from each platform
15. **Big movers need visuals** — Show thumbnails/screenshots, not just text

## Implementation Plan

### Phase 1: Data Pipeline Fixes (Backend)

#### 1A. Fix URL/format topic extraction
- Filter out bigrams containing URL fragments (https, www, com, org, etc.)
- Filter out generic format terms (shorts, viral, video, content, post, etc.) that are format descriptors
- Add stopword list for common non-informative bigrams
- File: `lib/search/analytics-engine.ts`

#### 1B. Replace script-based topics with LLM-powered analysis
- Move topic extraction from code bigrams to the LLM narrative prompt
- Have Claude identify actual trending sub-topics with context
- Keep code-computed sentiment/engagement but let LLM do topic discovery
- File: `lib/prompts/narrative-prompt.ts`, `app/api/search/[id]/process/route.ts`

#### 1C. Fix topic score algorithm
- Current: `frequency * 2 + log10(engagement)` — caps at 100 too easily
- New: Relative scoring based on engagement vs. expected baseline for the niche
- Factor in: diversity of sources, cross-platform presence, comment-to-view ratio
- Score should rarely hit 100 — reserve for truly viral topics
- File: `lib/utils/compute-metrics.ts`

#### 1D. Fix sentiment labeling
- 0.6-1.0 = "Positive" (green)
- 0.2-0.6 = "Leaning positive"
- -0.2-0.2 = "Neutral" (gray)
- -0.6 to -0.2 = "Leaning negative"
- -1.0 to -0.6 = "Negative" (red)
- Show as percentage bar, not decimal number

#### 1E. Fix platform data gathering
- TikTok: Debug why 0 posts — check Apify actor response
- Web: Fix source counting — Brave results exist but stats show 0
- Quora: Increase search count for deep mode (currently capped at 20)
- Reddit: Verify scraping pipeline returns actual posts

### Phase 2: Results Page Redesign (Frontend)

#### 2A. Simplify top metrics
- Remove: "8 trending topics", "8 high-resonance" badges
- Remove: Topic score card (or redesign to be meaningful)
- Keep: Sources analyzed count
- Add: Compact platform source strip (icons + counts inline)
  - e.g., "🌐 35 · 🟠 20 · ▶️ 150 · 🎵 80 · Q 15"

#### 2B. Platform breakdown → Source strip
- Replace detailed cards with single-line summary
- Show platform icon + post count inline
- Only expand to details on click

#### 2C. Remove conversation themes section entirely

#### 2D. Build source browser
- Tabbed view by platform (Reddit, YouTube, TikTok, Quora, Web)
- Each tab shows actual posts sorted by engagement
- Reddit: Show post title, subreddit, score, top comments
- YouTube: Show video thumbnail, title, channel, view count, top comments
- TikTok: Show creator, description, play count, comments
- Quora: Show question, top answer snippet
- Web: Show article title, domain, snippet

#### 2E. TikTok/YouTube embed cards
- For TikTok: Show creator avatar area, description, engagement stats
- For YouTube: Show video thumbnail (img from YouTube), title, channel
- For Reddit: Show subreddit badge, title, score, comment count
- Sorted by engagement within each platform tab

#### 2F. Big movers with visuals
- For each big mover, try to show:
  - Channel/profile thumbnail from YouTube/TikTok data
  - Link to their content
  - Their top-performing piece from the search data

### Phase 3: LLM Topic Analysis

#### 3A. Enhanced narrative prompt
- Explicitly ask Claude to identify 5-10 trending SUB-TOPICS (not format types)
- Instruct: "Do NOT include format descriptors like 'shorts', 'video', 'content' as topics"
- Instruct: "Topics should be specific angles, ingredients, controversies, or niches"
- For "Avocado Toast" good topics would be: "Protein-loaded variations", "Restaurant price debates", "$20 avocado toast controversy", "Egg + avo combinations", "Weight loss claims"

#### 3B. Structured topic output from LLM
- Each topic includes: name, why_trending, sample_posts, sentiment, platforms_present
- Merge with code-computed engagement data for the resonance score
- This replaces the bigram extraction entirely for topic names

## Files to Modify

### Backend
- `lib/search/analytics-engine.ts` — URL/format filtering, remove bigram topic extraction
- `lib/prompts/narrative-prompt.ts` — Enhanced prompt for LLM topic discovery
- `app/api/search/[id]/process/route.ts` — Wire LLM topics, fix platform stats
- `lib/utils/compute-metrics.ts` — Topic score algorithm
- `lib/tiktok/search.ts` — Debug 0 results
- `lib/quora/client.ts` — Increase depth
- `lib/search/platform-router.ts` — Fix web source counting

### Frontend
- `app/admin/search/[id]/results-client.tsx` — Main results page restructure
- `components/results/metrics-row.tsx` — Simplify metrics
- `components/results/platform-breakdown.tsx` — Replace with source strip
- New: `components/results/source-browser.tsx` — Tabbed source viewer
- New: `components/results/platform-embed-card.tsx` — Platform-specific cards
- `components/reports/executive-summary.tsx` — Fix sentiment label
- Remove: conversation themes component usage

## Success Criteria
- No URL artifacts in topics
- No generic format descriptors as topics
- Topic score varies meaningfully (20-95 range, rarely 100)
- Sentiment shows correct label (Positive for 0.9, not Mixed)
- All 5 platforms return actual data
- Source browser shows real posts with engagement data
- TikTok/YouTube show thumbnails
- Big movers have visual context
- Deep search hits 200+ actual sources
