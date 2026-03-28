# Claude Code Prompt: Topic Search v2 — Multi-Platform Social Intelligence

## Task

Write a comprehensive PRD (Product Requirements Document) at `docs/PRD-topic-search-v2.md` for upgrading the Nativz Cortex Topic Search from a single-source Brave Search wrapper into a multi-platform social intelligence engine inspired by BuzzAbout.ai.

## Context

Nativz Cortex is a Next.js 16 app (App Router) deployed on Vercel with Supabase backend. It's a social media content management platform for a marketing agency. The existing Topic Search feature lets users search a topic, gathers web data via Brave Search API, feeds it to Claude AI via OpenRouter, and returns trending topics, sentiment analysis, video ideas, and content breakdowns.

**The problem:** The current search only pulls ~35 results from Brave (web snippets, not real social data). We need 10x the volume with real platform data: actual Reddit threads and comments, TikTok video comments, YouTube video comments. Users need to select which platforms to search, set precise date ranges (7d/30d/90d), and get 200+ results per search.

**The key differentiation from BuzzAbout:** Our Topic Search is the discovery layer (like BuzzAbout). But we already have a full video ideation pipeline downstream — video idea cards with approve/star/revision reactions, moodboard with TikTok/YouTube video analysis, content pillars, client strategy mode, ideas board, Nerd AI assistant. The PRD should connect the enhanced search TO these existing tools. Don't go deep on content production inside search results; go deeper on video idea generation and pipeline integration.

## Existing Codebase — Key Files to Read

Read these files to understand the current architecture before writing the PRD:

### Search System
- `app/api/search/route.ts` — Main search API endpoint (Brave → AI → store results)
- `lib/brave/client.ts` — Brave Search API client (`gatherSerpData()` runs 3 parallel searches)
- `lib/brave/types.ts` — Brave response types and `BraveSerpData` shape
- `lib/types/search.ts` — All search types: `TopicSearch`, `TrendingTopic`, `VideoIdea`, `SearchMetrics`, filter options
- `lib/prompts/topic-research.ts` — AI prompt builder for topic research
- `lib/prompts/client-strategy.ts` — AI prompt for client-specific strategy mode
- `lib/ai/client.ts` — OpenRouter/Claude AI client
- `lib/utils/compute-metrics.ts` — Metrics computation from SERP data

### Search UI
- `components/search/search-form.tsx` — Search input + filters (time range, client selector)
- `components/search/search-mode-selector.tsx` — General vs Client Strategy toggle
- `components/search/search-processing.tsx` — Processing/loading page
- `components/results/trending-topics-table.tsx` — Trending topics display
- `components/results/video-idea-card.tsx` — Video idea cards with reactions
- `components/results/content-pillars.tsx` — Content pillar display
- `components/results/emotions-breakdown.tsx` — Emotion analysis
- `components/results/content-breakdown.tsx` — Content type breakdown
- `components/results/sources-panel.tsx` — Source citations
- `components/results/niche-insights.tsx` — Niche performance insights
- `components/results/key-findings.tsx` — Key findings summary
- `app/search/[id]/page.tsx` — Search results page

### Existing Platform Integration
- `lib/tiktok/scraper.ts` — TikTok metadata + transcript extraction (tikwm + HTML + Groq Whisper)
- `lib/instagram/client.ts` — Instagram client
- `lib/social-auth/` — Social auth for Meta, TikTok, YouTube

### Pipeline (downstream tools the search feeds into)
- `app/api/concepts/react/route.ts` — Video idea approve/star/revision reactions
- `app/api/ideas/route.ts` — Ideas board submissions
- `components/moodboard/` — Video moodboard with analysis
- `components/results/video-idea-card.tsx` — Video ideas with reaction buttons

### Database
- `supabase/schema.sql` — Full database schema (see `topic_searches` table)
- `supabase/migrations/` — All migrations

## Current `topic_searches` Table Schema

```sql
CREATE TABLE topic_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  source TEXT NOT NULL,
  time_range TEXT NOT NULL,
  language TEXT NOT NULL,
  country TEXT NOT NULL,
  client_id UUID REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'pending',
  summary TEXT,
  metrics JSONB,
  activity_data JSONB,
  emotions JSONB,
  content_breakdown JSONB,
  trending_topics JSONB,
  serp_data JSONB,
  raw_ai_response JSONB,
  tokens_used INTEGER,
  estimated_cost DECIMAL(10,4),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  search_mode TEXT DEFAULT 'general',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

## API Keys & Services Available

| Service | Env Var | Status |
|---------|---------|--------|
| Brave Search | `BRAVE_SEARCH_API_KEY` | ✅ Configured |
| OpenRouter (Claude) | `OPENROUTER_API_KEY` | ✅ Configured |
| Groq (Whisper) | `GROQ_API_KEY` | ✅ Configured |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL` + keys | ✅ Configured |
| Apify (TikTok scraping) | Key: `REDACTED` | ✅ Available, needs env var added |
| Reddit API | Not yet configured | ❌ Needs Reddit app creation (free, 100 req/min) |
| YouTube Data API | Not yet configured | ❌ Needs GCP API key (free, 10K units/day) |
| Monday.com | `MONDAY_API_TOKEN` | ✅ Configured |
| Meta/Instagram | `META_APP_*` | ✅ Configured |

## What BuzzAbout.ai Does (for reference)

- **Platforms:** Reddit, TikTok, YouTube, Instagram, X, LinkedIn (multi-select checkboxes)
- **Filters:** Time range (custom), language, country/location
- **Pricing:** $49/mo for 200 "research hours", $149/mo for 600
- **Output:** Trending topics, sentiment analysis, audience analysis, conversation breakdown (posts vs comments separated), AI chat for exploring results, exportable PDF reports
- **Key feature:** ~90% accuracy data pipeline, keyword tool for boolean search queries
- **What it does NOT do:** Video ideation, content production, moodboards, client strategy

## PRD Requirements

The PRD should cover:

1. **Executive Summary** — What we're building and why
2. **Problem Statement** — Current limitations vs what's needed
3. **Goals & Non-Goals** — Be specific about what v2 includes and excludes
4. **Architecture** — Current flow → proposed flow with platform router
5. **Data Sources** — For each platform (Reddit, TikTok, YouTube, Brave):
   - API details, auth method, rate limits
   - What data we pull (posts, comments, metadata)
   - Date filtering capabilities
   - Volume per search
   - Cost per search
   - Fallback strategy
6. **Data Model Changes** — New TypeScript types, expanded SERP data structure, database migrations
7. **API Changes** — New platform clients, platform router, updated search API route
8. **UI Changes** — Platform multi-select picker, volume toggle, processing page updates, platform badges on results
9. **AI Prompt Changes** — How to handle 200+ results (clustering, summarization, token budget), platform-aware analysis, enhanced video ideation output
10. **Pipeline Integration** — How enhanced search connects to existing tools:
    - Search → Video Ideas → Concepts Board (approve/star reactions)
    - Search → Moodboard (1-click save reference videos)
    - Search → Client Strategy → Content Calendar
    - Search → Nerd AI assistant
11. **Implementation Plan** — Phased rollout (Reddit first since it's free, then YouTube, then TikTok)
12. **Cost Analysis** — Per-search cost breakdown by platform combination
13. **Risks & Mitigations**
14. **Open Questions**

## Important Constraints

- This runs on **Vercel** (serverless, no long-running processes). Apify runs are async.
- The `maxDuration` for API routes is 300 seconds (already set).
- Keep the existing AI response structure (`TopicSearchAIResponse`) — extend it, don't replace it.
- Backward compatibility: old searches (v1) must still render correctly.
- The search form currently hardcodes `source = 'all'` — the `SOURCE_OPTIONS` in types are unused. The new platform picker replaces this.
- TikTok has NO official search API for comments. Must use Apify actors or tikwm.com.
- Reddit free tier is 100 requests/minute, which is plenty.
- YouTube Data API is 10,000 units/day free. A search + comments costs ~200 units. That's ~50 full searches/day.

## Output

Write the PRD to `docs/PRD-topic-search-v2.md`. Make it thorough, technical, and implementation-ready. Include TypeScript type definitions, SQL migrations, and specific API endpoint signatures. This will be handed directly to a developer (or Claude Code) to implement.
