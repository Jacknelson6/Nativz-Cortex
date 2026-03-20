# Prospect audit presentation

## Overview

A new presentation type that lets the Nativz team audit a prospect's social media presence and content strategy before a sales call. The user enters a URL (website or social profile), the system scrapes public data and runs AI analysis, then presents findings in a structured audit format.

## Problem

Sales reps need a quick way to understand a prospect's current social media presence, content strategy, and gaps before hopping on a call. Today this is done manually by browsing their profiles — slow, inconsistent, and not presentable.

## Solution

Add a `prospect_audit` presentation type that automates prospect research:

1. **Input**: user pastes a URL (Instagram, TikTok, YouTube, Facebook page, or generic website)
2. **Scraping**: system pulls public profile data using existing scrape-social infrastructure + Brave Search for additional content discovery
3. **AI analysis**: Claude analyzes scraped content to extract content pillars, visual style patterns, posting cadence, hook strategies, and recommendations
4. **Presentation**: results displayed as an interactive audit with profile overview, pillar tier list, style breakdown, cadence chart, and recommendations

## Data model

Results are stored in `presentation.audit_data` as a `ProspectAuditData` object:

```ts
interface ProspectAuditData {
  url: string;                          // Original input URL
  status: 'idle' | 'running' | 'done' | 'error';
  error_message?: string;
  profile: {
    name: string;
    handle: string;
    platform: string;
    bio: string;
    followers: number | null;
    following: number | null;
    posts: number | null;
    engagement_rate: number | null;
    profile_image: string | null;
    url: string;
  } | null;
  content_pillars: Array<{
    name: string;
    description: string;
    post_count: number;
    avg_engagement: number;
    tier: 'S' | 'A' | 'B' | 'C' | 'D';
  }>;
  visual_styles: Array<{
    style: string;
    frequency_pct: number;
  }>;
  posting_cadence: {
    posts_per_week: number;
    best_days: string[];
    best_times: string[];
    consistency_score: number;   // 1-10
  } | null;
  hook_strategies: Array<{
    strategy: string;
    frequency_pct: number;
    effectiveness: 'high' | 'medium' | 'low';
  }>;
  recommendations: string[];
  scraped_content: string[];     // Raw content snippets used for analysis
  analyzed_at: string | null;
}
```

## User flow

### Setup screen
1. URL input field with platform auto-detection badge
2. "Run audit" button
3. Loading state with progress indicator while scraping + analyzing

### Results screen
1. **Profile overview card** — name, handle, platform icon, followers, posts, engagement rate, bio
2. **Content pillars** — ranked list with tier badges (S/A/B/C/D), post count, avg engagement
3. **Visual style breakdown** — horizontal bar chart showing format distribution
4. **Posting cadence** — posts/week stat, best days, consistency score
5. **Hook strategies** — what opening hooks they use, ranked by effectiveness
6. **Recommendations** — AI-generated action items for Nativz to pitch

### Editor toolbar
- Back button, title input, save indicator
- "Re-run audit" button to refresh data
- "Edit URL" to change target

## API

### `POST /api/presentations/[id]/audit`

**Input**: `{ url: string }`

**Process**:
1. Detect platform from URL domain
2. Scrape profile data (reuse existing scrape-social utilities)
3. Search for recent content via Brave Search (`site:instagram.com/p/ @handle`, etc.)
4. Send all gathered data to Claude for structured analysis
5. Save results to `presentation.audit_data`

**Output**: `{ success: true, audit_data: ProspectAuditData }`

**Config**: `maxDuration = 120` (scraping + AI analysis)

## Technical implementation

### Files to create
- `app/admin/presentations/[id]/prospect-audit-editor.tsx` — editor component
- `app/api/presentations/[id]/audit/route.ts` — audit API route

### Files to modify
- `app/admin/presentations/[id]/types.ts` — add `ProspectAuditData` type, update `PresentationData.type` union
- `app/api/presentations/route.ts` — add `prospect_audit` to Zod enum
- `app/admin/presentations/page.tsx` — add to `typeConfig` and create modal
- `app/admin/presentations/[id]/page.tsx` — render `ProspectAuditEditor` when type matches

### Database
- Add `prospect_audit` to `presentations_type_check` constraint via new migration

## Design

- Uses existing dark theme tokens (`bg-surface`, `bg-background`, `text-foreground`, etc.)
- Accent color: cyan/teal (`bg-cyan-500/15`, `text-cyan-400`) to differentiate from social audit (emerald) and benchmarks (orange)
- Profile card uses platform brand colors for icon backgrounds
- Tier badges use the standard S-D color scale
- Responsive: stacks on mobile, 2-column on desktop

## Edge cases

- URL doesn't match any known platform — treat as generic website, scrape for social links
- Scraping fails — show partial results with error message, let user retry
- AI analysis returns malformed JSON — use null-safe defaults throughout
- No content found — show empty state with suggestion to try a different URL
