# Nativz Cortex — Social Listening & Analytics Platform

## Complete Technical Specification

**Version:** 1.0
**Date:** February 17, 2026
**Author:** Nativz Development Team
**Status:** Pre-Development Spec

---

## 1. Product Overview

### 1.1 What This Is

Nativz Pulse is a dual-dashboard social listening, sentiment analysis, and content performance platform built for the Nativz marketing agency. It combines three capabilities into a single tool:

1. **Social Listening & Sentiment Engine** — AI-powered research that mines social conversations (Reddit, TikTok, forums, X/Twitter) for brand mentions, pain points, emotional resonance patterns, and trending topics. Modeled after BuzzAbout.ai's methodology.
2. **Content Performance Analytics** — Pulls public Facebook and Instagram page metrics via the Meta Graph API to show how client content is actually performing (engagement rates, reach estimates, post frequency, follower growth).
3. **Video Idea Pipeline** — AI-generated content concept cards derived from social listening data. Each card includes: topic, target emotion, suggested format, the social insight that inspired it, and a 1-2 sentence concept description. Not full scripts — actionable creative briefs your team can pick up and execute.

The platform serves two audiences through two interfaces:

- **Internal Dashboard (Admin)** — For the Nativz team: run reports, manage clients, view raw data, configure AI research parameters, track competitive intelligence, manage the content idea pipeline.
- **Client Portal (Viewer)** — For clients: view polished reports, see their content performance metrics, browse competitive benchmarking, access generated content ideas. Clean, Nativz-branded experience.

### 1.2 What This Is NOT

- Not a real-time social media monitoring tool (reports are generated on-demand or scheduled, not streaming)
- Not a content management system or publishing tool
- Not an ad account management platform (uses public page data only, not Marketing API)
- Not a replacement for Meta Business Suite or Google Analytics

### 1.3 Key Differentiator

Unlike BuzzAbout.ai which is a standalone research tool, Nativz Pulse ties social listening directly to content performance data. This means you can show clients: "Here's what people are saying about your brand → here's how your content is performing against those conversations → here are the content ideas we recommend based on the gaps." That closed loop is the value prop.

---

## 2. Architecture Overview

### 2.1 V1 Tech Stack (Vercel + Supabase)

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js 15)                    │
│              Deployed on Vercel (Edge Network)                │
│                                                               │
│  ┌──────────────────┐    ┌──────────────────────────────┐    │
│  │  Internal Admin   │    │     Client Portal (Viewer)    │    │
│  │  /admin/*         │    │     /portal/*                 │    │
│  └──────────────────┘    └──────────────────────────────┘    │
└──────────────────────────┬───────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │   API Layer  │
                    │  Next.js API │
                    │   Routes     │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────┴──────┐  ┌─────┴─────┐  ┌──────┴──────┐
   │  Supabase    │  │  Claude    │  │  Meta Graph  │
   │  (Postgres   │  │  API       │  │  API         │
   │   + Auth     │  │  (Sonnet)  │  │  (Public     │
   │   + Storage) │  │            │  │   Pages)     │
   └─────────────┘  └───────────┘  └─────────────┘
```

### 2.2 Stack Justification

| Component | Choice | Why |
|-----------|--------|-----|
| Framework | Next.js 15 (App Router) | You already know it. SSR for SEO-irrelevant dashboards is fine. Server Actions simplify API calls. |
| Hosting | Vercel | Zero-config deployment. Edge functions for API routes. You have existing experience. |
| Database | Supabase (Postgres) | Auth built-in. Row-level security for multi-tenant isolation. Real-time subscriptions if needed later. You have existing experience. |
| AI Layer | Claude API (Sonnet 4.5) | Powers the social listening research, sentiment analysis, and content ideation. Web search capability via tool use replaces the Perplexity dependency. |
| Meta Data | Meta Graph API v21.0 | Public page insights — post engagement, follower counts, page-level metrics. Free tier is sufficient for 1-5 clients. |
| Styling | Tailwind CSS | You already use it. Consistent with Nativz branding system. |
| Charts | Recharts | Lightweight, React-native, good for sentiment timelines and performance dashboards. |
| PDF Export | @react-pdf/renderer | Client-facing report exports. Nativz-branded. |

### 2.3 Future Stack: Cloudflare Migration Path

When you outgrow Vercel's pricing or need more control, here's the migration:

| Current (V1) | Future (V2) | Migration Effort |
|---------------|-------------|------------------|
| Vercel | Cloudflare Pages + Workers | Medium — rewrite API routes to Workers format |
| Supabase | Cloudflare D1 (SQLite) + Hyperdrive | High — schema migration, lose Supabase Auth (switch to Cloudflare Access or custom auth) |
| Supabase Auth | Cloudflare Access or Auth.js | Medium |
| Supabase Storage | Cloudflare R2 | Low — S3-compatible swap |
| Vercel Edge Functions | Cloudflare Workers | Low — similar runtime |
| Vercel Cron | Cloudflare Cron Triggers | Low — direct equivalent |

**Recommendation:** Stay on Vercel + Supabase for V1. The migration to Cloudflare is viable but not urgent at 1-5 clients. Cloudflare becomes compelling at 15+ clients when Vercel's pricing model starts to hurt, or if you need Workers AI for on-edge inference.

---

## 3. Database Schema (Supabase / Postgres)

### 3.1 Core Tables

```sql
-- ============================================================
-- ORGANIZATIONS & USERS
-- ============================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- "Nativz" (agency) or client name
  slug TEXT UNIQUE NOT NULL,             -- URL-safe identifier
  type TEXT NOT NULL CHECK (type IN ('agency', 'client')),
  logo_url TEXT,
  primary_color TEXT DEFAULT '#000000',  -- Nativz brand color
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  organization_id UUID REFERENCES organizations(id),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ
);

-- ============================================================
-- CLIENTS (brands being tracked)
-- ============================================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),  -- which org this client belongs to
  name TEXT NOT NULL,                     -- "Toastique"
  slug TEXT UNIQUE NOT NULL,
  industry TEXT NOT NULL,                 -- "Healthy Food & Beverage"
  category TEXT,                          -- "QSR Franchise - Acai/Toast/Juice"
  description TEXT,
  logo_url TEXT,
  website_url TEXT,
  
  -- Brand context for AI prompts
  target_audience TEXT,                   -- "Health-conscious millennials/Gen Z..."
  brand_voice TEXT,                       -- "Approachable wellness, slightly playful..."
  topic_keywords TEXT[],                  -- Array: ["healthy breakfast", "acai bowls", ...]
  social_sources TEXT[],                  -- Array: ["r/healthyfood", "TikTok #acaibowl", ...]
  
  -- Meta Graph API config
  meta_page_id TEXT,                      -- Facebook Page ID
  instagram_business_id TEXT,             -- Instagram Business Account ID
  meta_access_token_encrypted TEXT,       -- Encrypted page access token
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- ============================================================
-- COMPETITORS (tracked per client)
-- ============================================================

CREATE TABLE competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                     -- "Playa Bowls"
  meta_page_id TEXT,                      -- Their public Facebook Page ID
  instagram_handle TEXT,                  -- Their IG handle for public scraping
  website_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SOCIAL LISTENING REPORTS
-- ============================================================

CREATE TABLE listening_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Report metadata
  title TEXT NOT NULL,                    -- "Weekly Social Pulse - Feb 17, 2026"
  report_type TEXT NOT NULL CHECK (report_type IN ('manual', 'scheduled', 'alert')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- AI research configuration (what was searched)
  research_query TEXT NOT NULL,           -- The assembled prompt sent to Claude
  search_focus TEXT[],                    -- ["consumer pain points", "competitor sentiment", ...]
  date_range_start DATE,
  date_range_end DATE,
  
  -- AI-generated report content (structured JSON)
  executive_summary TEXT,
  raw_ai_response JSONB,                 -- Full structured response from Claude
  
  -- Parsed & normalized data (extracted from AI response)
  pain_points JSONB,                     -- Array of pain point objects
  trending_questions JSONB,              -- Array of question objects
  language_dictionary JSONB,             -- Problem/desire/objection language
  emotional_resonance_map JSONB,         -- Topic → emotion → intensity mapping
  competitive_gaps JSONB,                -- Array of gap objects
  content_opportunities JSONB,           -- Array of opportunity objects
  
  -- Sentiment summary scores
  overall_sentiment_score DECIMAL(3,2),  -- -1.0 to 1.0
  sentiment_breakdown JSONB,             -- { positive: 0.4, neutral: 0.35, negative: 0.25 }
  
  -- Token usage / cost tracking
  tokens_used INTEGER,
  estimated_cost DECIMAL(10,4),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id)
);

-- ============================================================
-- HISTORICAL SENTIMENT TRACKING
-- ============================================================

CREATE TABLE sentiment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  report_id UUID REFERENCES listening_reports(id),
  
  snapshot_date DATE NOT NULL,
  overall_score DECIMAL(3,2),            -- -1.0 to 1.0
  positive_pct DECIMAL(5,2),
  neutral_pct DECIMAL(5,2),
  negative_pct DECIMAL(5,2),
  
  -- Emotion breakdown
  emotions JSONB,                        -- { excitement: 0.3, frustration: 0.2, ... }
  
  -- Top themes at this point in time
  top_themes TEXT[],
  top_pain_points TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- CONTENT PERFORMANCE (Meta Graph API data)
-- ============================================================

CREATE TABLE meta_page_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'competitor')),
  competitor_id UUID REFERENCES competitors(id),  -- NULL if entity_type = 'client'
  
  snapshot_date DATE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  
  -- Page-level metrics
  followers_count INTEGER,
  followers_change INTEGER,              -- Delta from previous snapshot
  posts_count_period INTEGER,            -- Posts published in this period
  
  -- Engagement metrics (aggregated from public posts)
  avg_likes DECIMAL(10,2),
  avg_comments DECIMAL(10,2),
  avg_shares DECIMAL(10,2),
  avg_engagement_rate DECIMAL(5,4),      -- (likes+comments+shares) / followers
  estimated_reach INTEGER,               -- Estimated based on engagement
  
  -- Top performing content in this period
  top_posts JSONB,                       -- Array of { post_id, type, engagement, url, thumbnail }
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(client_id, entity_type, competitor_id, snapshot_date, platform)
);

CREATE TABLE meta_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'competitor')),
  competitor_id UUID REFERENCES competitors(id),
  
  platform TEXT NOT NULL,
  post_id TEXT NOT NULL,                 -- Meta's post ID
  post_url TEXT,
  post_type TEXT,                        -- "video", "image", "carousel", "reel"
  caption TEXT,
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,
  
  -- Engagement metrics
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  views INTEGER,                         -- Video views (NULL for non-video)
  engagement_rate DECIMAL(5,4),
  estimated_reach INTEGER,
  
  -- AI-generated analysis
  content_category TEXT,                 -- AI-classified: "educational", "promotional", etc.
  detected_themes TEXT[],
  
  fetched_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(post_id, platform)
);

-- ============================================================
-- VIDEO IDEA PIPELINE
-- ============================================================

CREATE TABLE content_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  report_id UUID REFERENCES listening_reports(id),  -- Which report spawned this idea
  
  -- Idea card content
  title TEXT NOT NULL,                    -- "The 'healthy' açaí myth nobody talks about"
  description TEXT NOT NULL,             -- 1-2 sentence concept description
  target_emotion TEXT NOT NULL,          -- "curiosity", "frustration", "FOMO", etc.
  suggested_format TEXT NOT NULL,        -- "talking_head", "broll_montage", "ugc_style", "duet", etc.
  source_insight TEXT NOT NULL,          -- The social listening insight that inspired this
  source_quote TEXT,                     -- Verbatim social quote if available
  
  -- Classification
  content_type TEXT,                     -- "educational", "myth_bust", "behind_scenes", "trend_response"
  estimated_virality TEXT CHECK (estimated_virality IN ('low', 'medium', 'high', 'viral_potential')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Workflow status
  status TEXT DEFAULT 'idea' CHECK (status IN ('idea', 'approved', 'in_production', 'published', 'archived')),
  assigned_to UUID REFERENCES users(id),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_clients_org ON clients(organization_id);
CREATE INDEX idx_reports_client ON listening_reports(client_id);
CREATE INDEX idx_reports_status ON listening_reports(status);
CREATE INDEX idx_reports_created ON listening_reports(created_at DESC);
CREATE INDEX idx_sentiment_client_date ON sentiment_snapshots(client_id, snapshot_date DESC);
CREATE INDEX idx_meta_snapshots_client ON meta_page_snapshots(client_id, snapshot_date DESC);
CREATE INDEX idx_meta_posts_client ON meta_posts(client_id, published_at DESC);
CREATE INDEX idx_ideas_client ON content_ideas(client_id);
CREATE INDEX idx_ideas_status ON content_ideas(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_page_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentiment_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

-- Admins can see everything
CREATE POLICY admin_all ON clients FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ));

-- Viewers can only see their organization's clients
CREATE POLICY viewer_clients ON clients FOR SELECT
  USING (
    organization_id = (
      SELECT organization_id FROM users WHERE users.id = auth.uid()
    )
  );

-- Cascade similar policies for all other tables via client_id joins
-- (Full RLS policies for each table follow the same pattern)
```

### 3.2 Row Level Security Strategy

The multi-tenancy model is simple:

- **Admins** (Nativz team, `role = 'admin'`): Full read/write access to all tables, all clients.
- **Viewers** (Client users, `role = 'viewer'`): Read-only access, scoped to their `organization_id`. A viewer at Toastique can only see Toastique's data.

Supabase RLS handles this at the database level, so even if frontend code has a bug, client data isolation is enforced.

---

## 4. Feature Specification

### 4.1 Module: Social Listening Engine

This is the core of the platform — the productized version of your existing Prompt 1 chain.

#### How It Works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌────────────┐
│ Admin clicks │     │ System builds│     │ Claude API call   │     │ Response   │
│ "New Report" │────▶│ research     │────▶│ with web_search   │────▶│ parsed &   │
│ + configures │     │ prompt from  │     │ tool enabled      │     │ stored in  │
│ parameters   │     │ client data  │     │ (replaces         │     │ Supabase   │
│              │     │ + templates  │     │  Perplexity)      │     │            │
└─────────────┘     └──────────────┘     └──────────────────┘     └────────────┘
```

#### Report Generation Flow

1. Admin selects a client and chooses report focus areas (pain points, competitor sentiment, trending topics, etc.)
2. System assembles a research prompt using:
   - Client's stored brand context (from `clients` table)
   - Competitor list (from `competitors` table)
   - Selected focus areas and any custom research questions
   - The Prompt 1 template from the original chatbot system
3. System calls **Claude API (Sonnet 4.5)** with **web search tool enabled** — this replaces the Perplexity step entirely. Claude searches Reddit, TikTok, forums, news sites, etc.
4. Claude returns structured JSON response matching the Prompt 1 output format
5. System parses the response, stores raw + normalized data in `listening_reports`
6. System creates a `sentiment_snapshot` for historical tracking
7. Report is displayed in the dashboard with visualizations

#### AI Prompt Assembly (Server-Side)

The system dynamically builds the research prompt. This is stored as a template in the codebase, not hardcoded:

```typescript
// /lib/prompts/social-listening.ts

export function buildListeningPrompt(config: {
  client: Client;
  competitors: Competitor[];
  focusAreas: string[];
  customQuestions?: string[];
  dateRange?: { start: string; end: string };
}): string {
  return `
# SOCIAL LISTENING & SENTIMENT INTELLIGENCE RESEARCH

## ROLE
You are an advanced market intelligence researcher. Your methodology:
- Build threads connecting related posts, comments, and replies
- Extract emotional resonance patterns, not just positive/negative
- Identify authentic consumer language vs. corporate speak
- Detect emerging trends before they go mainstream

## BRAND CONTEXT
- Brand: ${config.client.name}
- Category: ${config.client.category}
- Industry: ${config.client.industry}
- Target Audience: ${config.client.target_audience}
- Competitors: ${config.competitors.map(c => c.name).join(', ')}

## RESEARCH MISSION
Search for and analyze social conversations about the following topics:
Keywords: ${config.client.topic_keywords.join(', ')}
Sources to prioritize: ${config.client.social_sources.join(', ')}
Focus areas: ${config.focusAreas.join(', ')}
${config.customQuestions ? `Custom research questions:\n${config.customQuestions.map(q => `- ${q}`).join('\n')}` : ''}
Date focus: ${config.dateRange ? `${config.dateRange.start} to ${config.dateRange.end}` : 'Last 30 days'}

## ANALYSIS FRAMEWORK
[... full Prompt 1 framework from original system ...]

## OUTPUT FORMAT
You MUST respond in valid JSON matching this exact schema:
{
  "executive_summary": "string",
  "overall_sentiment": { "score": number, "positive_pct": number, ... },
  "pain_points": [{ "name": "string", "frequency": "string", ... }],
  "trending_questions": [...],
  "language_dictionary": { "problem": [...], "desire": [...], "objection": [...] },
  "emotional_resonance_map": [...],
  "competitive_gaps": [...],
  "content_opportunities": [...]
}
`;
}
```

#### Claude API Call Pattern

```typescript
// /app/api/reports/generate/route.ts

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { clientId, focusAreas, customQuestions } = await req.json();
  
  // 1. Fetch client + competitor data from Supabase
  const clientData = await supabase.from('clients').select('*').eq('id', clientId).single();
  const competitors = await supabase.from('competitors').select('*').eq('client_id', clientId);
  
  // 2. Create pending report record
  const report = await supabase.from('listening_reports').insert({
    client_id: clientId,
    status: 'processing',
    report_type: 'manual',
    research_query: prompt,
  }).select().single();
  
  // 3. Build prompt
  const prompt = buildListeningPrompt({
    client: clientData,
    competitors: competitors,
    focusAreas,
    customQuestions,
  });
  
  // 4. Call Claude with web search enabled
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8000,
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
    }],
    messages: [{ role: 'user', content: prompt }],
  });
  
  // 5. Extract text content from response (may include tool use blocks)
  const textContent = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
  
  // 6. Parse JSON response
  const parsed = JSON.parse(textContent.replace(/```json|```/g, '').trim());
  
  // 7. Update report with results
  await supabase.from('listening_reports').update({
    status: 'completed',
    executive_summary: parsed.executive_summary,
    raw_ai_response: parsed,
    pain_points: parsed.pain_points,
    trending_questions: parsed.trending_questions,
    // ... all other fields
    overall_sentiment_score: parsed.overall_sentiment.score,
    sentiment_breakdown: parsed.overall_sentiment,
    tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    completed_at: new Date().toISOString(),
  }).eq('id', report.id);
  
  // 8. Create sentiment snapshot for historical tracking
  await supabase.from('sentiment_snapshots').insert({
    client_id: clientId,
    report_id: report.id,
    snapshot_date: new Date().toISOString().split('T')[0],
    overall_score: parsed.overall_sentiment.score,
    positive_pct: parsed.overall_sentiment.positive_pct,
    // ... etc
  });
  
  return Response.json({ reportId: report.id, status: 'completed' });
}
```

#### Report Display Components

The completed report renders as a rich dashboard view with these sections:

| Section | Visualization | Data Source |
|---------|--------------|-------------|
| Executive Summary | Text card with key insight highlighted | `executive_summary` |
| Sentiment Score | Large gauge/dial + trend sparkline | `overall_sentiment_score` + historical |
| Emotion Breakdown | Radar chart (excitement, frustration, FOMO, etc.) | `emotional_resonance_map` |
| Pain Points | Ranked cards with severity badges | `pain_points` |
| Trending Questions | Sortable table with emotion + hook potential | `trending_questions` |
| Language Dictionary | Three-column layout (Problem / Desire / Objection) | `language_dictionary` |
| Competitive Gaps | Card list with opportunity indicators | `competitive_gaps` |
| Content Opportunities | Actionable cards → link to idea pipeline | `content_opportunities` |

---

### 4.2 Module: Content Performance Analytics (Meta Graph API)

#### Data Collection

A scheduled job (Vercel Cron) runs daily to pull public page metrics:

```typescript
// /app/api/cron/meta-sync/route.ts

// Runs daily at 6:00 AM UTC via vercel.json cron config
export async function GET() {
  const clients = await supabase.from('clients')
    .select('*, competitors(*)')
    .eq('is_active', true)
    .not('meta_page_id', 'is', null);
  
  for (const client of clients) {
    // Fetch client's own page data
    await fetchAndStorePageMetrics(client.id, 'client', null, client.meta_page_id);
    
    // Fetch each competitor's public page data
    for (const competitor of client.competitors) {
      if (competitor.meta_page_id) {
        await fetchAndStorePageMetrics(client.id, 'competitor', competitor.id, competitor.meta_page_id);
      }
    }
  }
}
```

#### Meta Graph API Endpoints Used

All public data — no Marketing API or ad account access needed:

| Endpoint | Data Retrieved | Auth Required |
|----------|---------------|---------------|
| `GET /{page-id}?fields=followers_count,fan_count,name` | Page follower count | App Token |
| `GET /{page-id}/posts?fields=message,created_time,likes.summary(true),comments.summary(true),shares` | Recent posts + engagement | App Token |
| `GET /{page-id}/published_posts?fields=...` | Published posts (own pages with Page Token) | Page Token |
| `GET /{ig-user-id}/media?fields=caption,media_type,timestamp,like_count,comments_count` | Instagram posts + engagement | Page Token |

**Important:** For competitors, you can only access their *public* Facebook page data via the Graph API with an App Token. Instagram competitor data requires scraping their public profile or using third-party estimation. The system handles this gracefully — competitor Instagram data will be estimated from public engagement patterns.

#### Performance Dashboard Views

**Client Performance Tab:**
- Follower growth over time (line chart)
- Engagement rate trend (line chart)
- Post frequency calendar heatmap
- Top performing posts grid (sortable by likes, comments, shares, views)
- Content type breakdown (pie chart: video vs. image vs. carousel vs. reel)
- Best posting times (heatmap)

**Competitive Benchmarking Tab:**
- Side-by-side follower comparison (bar chart)
- Engagement rate comparison (your client vs. each competitor)
- Posting frequency comparison
- Content mix comparison (what types of content competitors post most)
- "Share of voice" estimation based on engagement volume
- Estimated reach comparison

**Industry Overview Tab:**
- Average engagement rates for the industry vertical
- Trending content formats in the category
- Industry-wide sentiment from social listening data
- Benchmark indicators (is the client above/below industry average)

---

### 4.3 Module: Video Idea Pipeline

This replaces Prompts 2 and 3 from the original system with a streamlined ideation layer.

#### Generation Flow

When a social listening report completes, the system can auto-generate content ideas:

```typescript
// /lib/prompts/content-ideation.ts

export function buildIdeationPrompt(report: ListeningReport, client: Client): string {
  return `
# CONTENT IDEA GENERATION

## ROLE
You are a social media content strategist for ${client.name}. 
Generate actionable video content ideas based on social listening data.
Do NOT write full scripts. Generate concept cards only.

## BRAND CONTEXT
Brand: ${client.name}
Voice: ${client.brand_voice}
Audience: ${client.target_audience}

## SOCIAL LISTENING DATA
${JSON.stringify(report.raw_ai_response)}

## GENERATE 10 CONTENT IDEAS

For each idea, provide:
1. title: Compelling working title (what you'd call this in a content calendar)
2. description: 1-2 sentence concept. What happens in this video?
3. target_emotion: Primary emotion to evoke (curiosity, FOMO, frustration, excitement, etc.)
4. suggested_format: One of: talking_head, broll_montage, ugc_style, duet_response, 
   green_screen, street_interview, day_in_the_life, before_after, tutorial, myth_bust
5. source_insight: Which social listening finding inspired this idea
6. source_quote: A real social media quote that validates this idea (from the data)
7. content_type: educational, myth_bust, behind_scenes, trend_response, ugc_reply, 
   transformation, comparison, day_in_the_life
8. estimated_virality: low, medium, high, or viral_potential
9. priority: Based on emotional intensity + trending velocity from the data

Respond in valid JSON array format.
`;
}
```

#### Idea Pipeline UI

The idea pipeline is a Kanban-style board visible on both dashboards:

**Columns:**
- 💡 **Ideas** — Auto-generated from reports. Can be manually added too.
- ✅ **Approved** — Admin has approved for production.
- 🎬 **In Production** — Being filmed/edited.
- 📱 **Published** — Live on social. Can link to actual post URL.
- 📦 **Archived** — Shelved ideas for later.

**Each card shows:**
- Title
- Target emotion badge (color-coded)
- Suggested format icon
- Virality estimate indicator
- Source insight (collapsed, expandable)
- Assigned team member (admin only)

Clients see the pipeline in read-only mode. They can see what ideas are being worked on and what's been published — transparency into the content creation process.

---

### 4.4 Module: Historical Trend Tracking

Every time a report runs, a sentiment snapshot is stored. Over time, this builds a timeline:

**Sentiment Trend Chart:**
- X-axis: Date
- Y-axis: Sentiment score (-1 to +1)
- Overlaid: Key events (product launches, viral moments, PR incidents)
- Comparison line: Industry average sentiment

**Emotion Trend Stacked Area Chart:**
- Shows how the emotion mix changes over time
- Example: Excitement spikes during menu launch, frustration spikes during service issues

**Pain Point Evolution:**
- Track how specific pain points rise and fall in prominence
- "Price concern" was #1 in January, dropped to #3 by March after value messaging campaign

**Competitive Sentiment Comparison:**
- Your client's sentiment vs. each competitor over time
- Highlight periods where your client gained/lost ground

---

### 4.5 Module: Report Export (PDF)

Clients and admins can export any report as a branded PDF:

**PDF Layout:**
1. Cover page with Nativz logo + "Prepared for [Client Name]" + date
2. Executive summary page
3. Sentiment overview with charts
4. Pain points detail pages
5. Competitive benchmarking page
6. Content opportunities page
7. Historical trends page
8. Appendix: methodology note

Built with `@react-pdf/renderer` for server-side generation, stored in Supabase Storage, downloadable from either dashboard.

---

## 5. User Interface Specification

### 5.1 Internal Admin Dashboard (`/admin/*`)

```
/admin
├── /dashboard                    ← Overview: all clients at a glance
├── /clients
│   ├── /                         ← Client list
│   ├── /[slug]                   ← Single client overview
│   ├── /[slug]/reports           ← All reports for this client
│   ├── /[slug]/reports/new       ← Generate new report
│   ├── /[slug]/reports/[id]      ← View specific report
│   ├── /[slug]/performance       ← Meta analytics dashboard
│   ├── /[slug]/competitors       ← Manage competitors
│   ├── /[slug]/ideas             ← Content idea pipeline
│   ├── /[slug]/trends            ← Historical sentiment trends
│   └── /[slug]/settings          ← Client config (brand context, API keys, etc.)
├── /team                         ← Manage team members
├── /settings                     ← Agency-wide settings
└── /billing                      ← API usage tracking / cost monitoring
```

**Admin-Only Features:**
- Create/edit/delete clients
- Configure brand context and AI research parameters
- Manage competitor lists
- Generate reports (manual trigger)
- Set up scheduled reports
- Move ideas through pipeline statuses
- Assign ideas to team members
- View API usage and cost tracking
- Manage viewer accounts for clients
- Export reports as PDF
- View raw AI responses (debug mode)

### 5.2 Client Portal (`/portal/*`)

```
/portal
├── /dashboard                    ← Client's overview (their brand only)
├── /reports
│   ├── /                         ← All reports (list view)
│   └── /[id]                     ← View specific report
├── /performance                  ← Their Meta analytics
├── /competitors                  ← Competitive benchmarking (read-only)
├── /ideas                        ← Content idea pipeline (read-only)
├── /trends                       ← Historical sentiment trends
└── /settings                     ← Profile settings only
```

**Client Sees:**
- Polished versions of reports (no raw AI data, no cost info)
- Their content performance metrics
- Competitive benchmarking (positioning it as intelligence Nativz provides)
- Content idea pipeline (read-only — they see what you're working on)
- Historical trends with commentary
- PDF export of any report

**Client Does NOT See:**
- Other clients' data
- API costs or token usage
- Raw AI prompts or responses
- Internal notes or assignments
- Team member management
- Report generation controls

### 5.3 Branding System

All interfaces carry consistent Nativz branding:

```typescript
// /lib/brand.ts

export const NATIVZ_BRAND = {
  name: 'Nativz',
  tagline: 'Social Intelligence, Powered by AI',
  
  // Colors (update with actual Nativz brand colors)
  colors: {
    primary: '#000000',        // Primary brand color
    secondary: '#FFFFFF',      // Secondary
    accent: '#6366F1',         // Accent (indigo for interactive elements)
    background: '#F9FAFB',     // Light gray background
    surface: '#FFFFFF',        // Card backgrounds
    text: '#111827',           // Primary text
    textSecondary: '#6B7280',  // Secondary text
    success: '#10B981',        // Positive sentiment
    warning: '#F59E0B',        // Neutral / caution
    danger: '#EF4444',         // Negative sentiment
  },
  
  // Typography
  fonts: {
    heading: 'Inter',          // Or whatever Nativz uses
    body: 'Inter',
  },
  
  // Logo paths (stored in /public/brand/)
  logos: {
    full: '/brand/nativz-logo-full.svg',
    mark: '/brand/nativz-logo-mark.svg',
    white: '/brand/nativz-logo-white.svg',
  },
};
```

---

## 6. Authentication & Authorization

### 6.1 Auth Flow

Using Supabase Auth with email/password (magic link optional):

```
Admin Login:  pulse.nativz.com/admin/login   → redirects to /admin/dashboard
Client Login: pulse.nativz.com/portal/login  → redirects to /portal/dashboard
```

### 6.2 Middleware

```typescript
// /middleware.ts

import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const supabase = createServerClient(/* ... */);
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    // Redirect to appropriate login page
    if (req.nextUrl.pathname.startsWith('/admin')) {
      return NextResponse.redirect('/admin/login');
    }
    if (req.nextUrl.pathname.startsWith('/portal')) {
      return NextResponse.redirect('/portal/login');
    }
  }
  
  // Fetch user role
  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single();
  
  // Enforce role-based access
  if (req.nextUrl.pathname.startsWith('/admin') && user.role !== 'admin') {
    return NextResponse.redirect('/portal/dashboard');
  }
  if (req.nextUrl.pathname.startsWith('/portal') && user.role === 'admin') {
    // Admins can access portal too (to preview client view)
    // No redirect needed
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*'],
};
```

### 6.3 Client Onboarding Flow

1. Admin creates a new client in `/admin/clients/new`
2. Admin fills in brand context (name, industry, audience, voice, keywords, competitors)
3. Admin optionally connects Meta page ID
4. Admin creates a viewer account: enters client contact's email → Supabase sends invite
5. Client receives email, sets password, logs into portal
6. Client sees their dashboard with any existing reports

---

## 7. API Routes

### 7.1 Route Map

```
/api
├── /auth
│   ├── POST /signup                    ← Admin creates viewer accounts
│   └── POST /login                     ← Login (handled by Supabase client)
│
├── /clients
│   ├── GET    /                         ← List clients (admin: all, viewer: own)
│   ├── POST   /                         ← Create client (admin only)
│   ├── GET    /[id]                     ← Get client details
│   ├── PATCH  /[id]                     ← Update client (admin only)
│   └── DELETE /[id]                     ← Delete client (admin only)
│
├── /clients/[id]/competitors
│   ├── GET    /                         ← List competitors
│   ├── POST   /                         ← Add competitor (admin only)
│   ├── PATCH  /[competitorId]           ← Update competitor
│   └── DELETE /[competitorId]           ← Remove competitor
│
├── /reports
│   ├── GET    /                         ← List reports (filtered by client)
│   ├── POST   /generate                 ← Generate new report (admin only)
│   ├── GET    /[id]                     ← Get report details
│   ├── GET    /[id]/export              ← Export report as PDF
│   └── DELETE /[id]                     ← Delete report (admin only)
│
├── /ideas
│   ├── GET    /                         ← List ideas (filtered by client)
│   ├── POST   /generate                 ← Generate ideas from report (admin only)
│   ├── POST   /                         ← Create manual idea (admin only)
│   ├── PATCH  /[id]                     ← Update idea status/assignment (admin only)
│   └── DELETE /[id]                     ← Delete idea (admin only)
│
├── /analytics
│   ├── GET    /performance?clientId=X   ← Get Meta performance data
│   ├── GET    /trends?clientId=X        ← Get historical sentiment data
│   └── GET    /competitive?clientId=X   ← Get competitive benchmarking data
│
└── /cron
    ├── GET /meta-sync                   ← Daily Meta data sync (Vercel Cron)
    └── GET /scheduled-reports           ← Scheduled report generation (Vercel Cron)
```

---

## 8. Deployment Guide (Claude Code)

### 8.1 Prerequisites

Before starting with Claude Code, ensure you have:

- [ ] Node.js 20+ installed
- [ ] A Vercel account with CLI installed (`npm i -g vercel`)
- [ ] A Supabase project created (free tier works for MVP)
- [ ] Anthropic API key (for Claude Sonnet 4.5)
- [ ] Meta Developer App created (for Graph API access)
- [ ] Nativz logo assets in SVG/PNG format

### 8.2 Project Initialization with Claude Code

Open your terminal and start Claude Code in a new directory:

```bash
mkdir nativz-pulse && cd nativz-pulse
claude
```

Give Claude Code the following initialization prompt:

```
Initialize a Next.js 15 project with the App Router, TypeScript, Tailwind CSS, 
and the following dependencies:

Production deps:
- @supabase/supabase-js @supabase/ssr (Supabase client + SSR helpers)
- @anthropic-ai/sdk (Claude API)
- recharts (charts)
- @react-pdf/renderer (PDF export)
- date-fns (date formatting)
- zod (schema validation)
- lucide-react (icons)

Dev deps:
- @types/node @types/react

Project structure should follow the App Router convention:
/app
  /admin (internal dashboard layout group)
  /portal (client portal layout group)
  /api (API routes)
/components (shared UI components)
/lib (utilities, Supabase client, prompts, types)
/public/brand (Nativz logo assets)
```

### 8.3 Environment Variables

Create `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Meta Graph API
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_APP_ACCESS_TOKEN=your_app_id|your_app_secret  # App token format

# App
NEXT_PUBLIC_APP_URL=https://pulse.nativz.com
```

### 8.4 Supabase Setup

Run the SQL schema from Section 3 in the Supabase SQL Editor. Then:

1. **Enable Email Auth** in Supabase Dashboard → Authentication → Providers
2. **Set up RLS policies** (included in the SQL above)
3. **Create Storage bucket** named `reports` for PDF exports
4. **Create your admin user** manually in Supabase Auth, then insert matching `users` record with `role = 'admin'`

### 8.5 Vercel Deployment

```bash
# Link to Vercel
vercel link

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add META_APP_ID
vercel env add META_APP_SECRET
vercel env add META_APP_ACCESS_TOKEN

# Deploy
vercel --prod
```

### 8.6 Vercel Cron Configuration

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/meta-sync",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/scheduled-reports",
      "schedule": "0 8 * * 1"
    }
  ]
}
```

- Meta data sync runs daily at 6:00 AM UTC
- Scheduled reports run weekly on Mondays at 8:00 AM UTC

### 8.7 Custom Domain

In Vercel Dashboard:
1. Add custom domain: `pulse.nativz.com`
2. Update DNS records as instructed
3. SSL is automatic

---

## 9. Development Phases

### Phase 1: Foundation (Week 1-2)

- [ ] Project setup (Next.js, Supabase, Tailwind)
- [ ] Supabase schema + RLS policies
- [ ] Authentication flow (admin + viewer)
- [ ] Admin layout with navigation
- [ ] Client CRUD (create, read, update, delete)
- [ ] Competitor management per client
- [ ] Basic branding system (Nativz colors, logo, typography)

### Phase 2: Social Listening Core (Week 3-4)

- [ ] AI prompt template system
- [ ] Report generation API route (Claude + web search)
- [ ] Report display page with all sections
- [ ] Sentiment score visualization (gauge + breakdown)
- [ ] Pain points ranked display
- [ ] Trending questions table
- [ ] Language dictionary display
- [ ] Emotional resonance radar chart
- [ ] Competitive gaps cards
- [ ] Content opportunities cards

### Phase 3: Content Performance (Week 5-6)

- [ ] Meta Graph API integration
- [ ] Daily cron job for data sync
- [ ] Client performance dashboard (charts + tables)
- [ ] Competitor data collection (public pages)
- [ ] Competitive benchmarking views
- [ ] Post-level analytics display
- [ ] Top performing content grid

### Phase 4: Ideas & History (Week 7-8)

- [ ] Content idea generation from reports
- [ ] Kanban pipeline UI
- [ ] Idea card components
- [ ] Drag-and-drop status updates (admin)
- [ ] Historical sentiment snapshots
- [ ] Trend charts over time
- [ ] Competitive sentiment comparison over time

### Phase 5: Client Portal + Export (Week 9-10)

- [ ] Client portal layout (separate from admin)
- [ ] Client-scoped views (reports, performance, ideas, trends)
- [ ] PDF report generation
- [ ] Nativz-branded PDF template
- [ ] Client onboarding flow (admin invites client user)
- [ ] Read-only idea pipeline for clients

### Phase 6: Polish & Deploy (Week 11-12)

- [ ] Loading states and error handling throughout
- [ ] Mobile responsiveness
- [ ] Vercel deployment + custom domain
- [ ] Vercel cron jobs configured
- [ ] Performance optimization (SSR, caching)
- [ ] Admin API usage / cost tracking dashboard
- [ ] Testing with first real client (Toastique)
- [ ] Bug fixes and refinements

---

## 10. Cost Estimation

### 10.1 Monthly Infrastructure Costs (1-5 Clients)

| Service | Tier | Estimated Cost |
|---------|------|---------------|
| Vercel | Pro ($20/mo) | $20/mo |
| Supabase | Free tier (500MB, 50K auth requests) | $0/mo |
| Anthropic API | Pay-per-use | ~$15-40/mo |
| Meta Graph API | Free tier | $0/mo |
| Custom domain (DNS) | Already have | $0/mo |
| **Total** | | **~$35-60/mo** |

### 10.2 Anthropic API Cost Breakdown

Per social listening report (Claude Sonnet 4.5 with web search):
- Estimated input tokens: ~3,000 (prompt + brand context)
- Estimated output tokens: ~4,000 (structured report)
- Web search tool calls: ~5-10 per report
- Estimated cost per report: ~$0.10-0.25

Per content ideation run:
- Estimated input tokens: ~5,000 (report data + prompt)
- Estimated output tokens: ~3,000 (10 idea cards)
- Estimated cost per run: ~$0.05-0.15

At 4 reports/month × 5 clients = 20 reports + 20 ideation runs = ~$5-8/month in API costs.

### 10.3 Scaling Costs

At 15+ clients, you'd likely need:
- Vercel Pro: $20/mo (still sufficient)
- Supabase Pro: $25/mo (for more storage + connections)
- Anthropic: ~$15-25/mo (60+ reports/month)
- **Total: ~$60-70/mo**

This is where the Cloudflare migration starts making financial sense — Cloudflare Workers has a much more generous free tier and cheaper compute.

---

## 11. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Client data isolation | Supabase RLS enforces at database level |
| API key exposure | Server-side only; never in client bundles |
| Meta tokens | Encrypted at rest in Supabase; decrypted server-side only |
| Rate limiting | Vercel Edge middleware rate limits API routes |
| Input sanitization | Zod validation on all API inputs |
| XSS prevention | React's built-in escaping + CSP headers |
| Auth session management | Supabase handles JWT refresh, session expiry |

---

## 12. Future Enhancements (Post-MVP)

These are features to consider once the core platform is stable:

| Feature | Description | Priority |
|---------|-------------|----------|
| **Google Ads Integration** | Pull Google Ads performance data alongside Meta | High |
| **TikTok API Integration** | TikTok Business API for organic performance metrics | High |
| **Alert System** | Real-time notifications when sentiment spikes (positive or negative) | Medium |
| **Scheduled Reports** | Auto-generate reports on a weekly/monthly cadence per client | Medium |
| **Influencer Signal Detection** | Flag high-follower accounts discussing client-relevant topics | Medium |
| **Client Self-Service Report Requests** | Let clients trigger their own reports from the portal | Low |
| **AI Creative Brief Generator** | Turn ideas into detailed briefs with moodboards, reference content, and shot lists | Low |
| **Slack Integration** | Push report summaries and alerts to team Slack channels | Low |
| **Cloudflare Migration** | Move to Cloudflare Pages + Workers + D1 for cost optimization at scale | Future |
| **White-Label Option** | Allow client branding on exports (for enterprise upsell) | Future |
| **Multi-Agency** | Support multiple agencies on the platform (SaaS productization) | Future |

---

## 13. Claude Code Command Reference

Here are the key Claude Code commands you'll use throughout development:

```bash
# Start Claude Code in the project directory
cd nativz-pulse && claude

# Useful Claude Code patterns for this project:

# "Create the Supabase client utility"
# "Build the social listening prompt template based on this spec"
# "Create the report generation API route"
# "Build the admin dashboard layout with sidebar navigation"
# "Create the sentiment gauge chart component using Recharts"
# "Build the competitive benchmarking comparison chart"
# "Create the content idea Kanban board component"
# "Build the PDF export template with Nativz branding"
# "Set up the middleware for role-based auth"
# "Create the Meta Graph API sync cron job"
```

When working with Claude Code, reference this spec document directly. You can paste relevant sections as context, or keep the file in the project root for Claude Code to read.

---

## 14. File Structure Reference

```
nativz-pulse/
├── app/
│   ├── admin/
│   │   ├── layout.tsx                    # Admin shell (sidebar + header)
│   │   ├── dashboard/page.tsx            # Admin home
│   │   ├── clients/
│   │   │   ├── page.tsx                  # Client list
│   │   │   ├── new/page.tsx              # Create client
│   │   │   └── [slug]/
│   │   │       ├── page.tsx              # Client overview
│   │   │       ├── reports/
│   │   │       │   ├── page.tsx          # Report list
│   │   │       │   ├── new/page.tsx      # Generate report
│   │   │       │   └── [id]/page.tsx     # View report
│   │   │       ├── performance/page.tsx  # Meta analytics
│   │   │       ├── competitors/page.tsx  # Manage competitors
│   │   │       ├── ideas/page.tsx        # Content idea pipeline
│   │   │       ├── trends/page.tsx       # Historical trends
│   │   │       └── settings/page.tsx     # Client settings
│   │   ├── team/page.tsx                 # Team management
│   │   └── settings/page.tsx             # Agency settings
│   │
│   ├── portal/
│   │   ├── layout.tsx                    # Client portal shell
│   │   ├── dashboard/page.tsx            # Client home
│   │   ├── reports/
│   │   │   ├── page.tsx                  # Report list
│   │   │   └── [id]/page.tsx             # View report
│   │   ├── performance/page.tsx          # Meta analytics
│   │   ├── competitors/page.tsx          # Benchmarking (read-only)
│   │   ├── ideas/page.tsx                # Idea pipeline (read-only)
│   │   ├── trends/page.tsx               # Historical trends
│   │   └── settings/page.tsx             # Profile settings
│   │
│   ├── api/
│   │   ├── auth/signup/route.ts
│   │   ├── clients/route.ts
│   │   ├── clients/[id]/route.ts
│   │   ├── clients/[id]/competitors/route.ts
│   │   ├── reports/generate/route.ts
│   │   ├── reports/[id]/route.ts
│   │   ├── reports/[id]/export/route.ts
│   │   ├── ideas/generate/route.ts
│   │   ├── ideas/route.ts
│   │   ├── ideas/[id]/route.ts
│   │   ├── analytics/performance/route.ts
│   │   ├── analytics/trends/route.ts
│   │   ├── analytics/competitive/route.ts
│   │   └── cron/
│   │       ├── meta-sync/route.ts
│   │       └── scheduled-reports/route.ts
│   │
│   ├── (auth)/
│   │   ├── admin/login/page.tsx
│   │   └── portal/login/page.tsx
│   │
│   ├── layout.tsx                        # Root layout
│   └── page.tsx                          # Landing redirect
│
├── components/
│   ├── ui/                               # Base UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   ├── table.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   ├── charts/                           # Chart components
│   │   ├── sentiment-gauge.tsx
│   │   ├── emotion-radar.tsx
│   │   ├── trend-line.tsx
│   │   ├── engagement-bar.tsx
│   │   ├── posting-heatmap.tsx
│   │   └── competitive-comparison.tsx
│   ├── reports/                          # Report display components
│   │   ├── executive-summary.tsx
│   │   ├── pain-points-list.tsx
│   │   ├── trending-questions.tsx
│   │   ├── language-dictionary.tsx
│   │   ├── competitive-gaps.tsx
│   │   └── content-opportunities.tsx
│   ├── ideas/                            # Idea pipeline components
│   │   ├── idea-board.tsx
│   │   ├── idea-card.tsx
│   │   └── idea-detail.tsx
│   ├── layout/                           # Layout components
│   │   ├── admin-sidebar.tsx
│   │   ├── portal-sidebar.tsx
│   │   ├── header.tsx
│   │   └── brand-footer.tsx
│   └── shared/                           # Shared components
│       ├── client-selector.tsx
│       ├── date-range-picker.tsx
│       ├── loading-skeleton.tsx
│       └── error-boundary.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                     # Browser client
│   │   ├── server.ts                     # Server client
│   │   └── admin.ts                      # Service role client
│   ├── prompts/
│   │   ├── social-listening.ts           # Report generation prompt
│   │   └── content-ideation.ts           # Idea generation prompt
│   ├── meta/
│   │   ├── graph-api.ts                  # Meta Graph API client
│   │   └── data-transform.ts             # Transform API responses
│   ├── types/
│   │   ├── database.ts                   # Supabase generated types
│   │   ├── reports.ts                    # Report type definitions
│   │   └── analytics.ts                  # Analytics type definitions
│   ├── utils/
│   │   ├── format.ts                     # Number/date formatting
│   │   ├── sentiment.ts                  # Sentiment score utilities
│   │   └── export.ts                     # PDF generation utilities
│   └── brand.ts                          # Nativz branding constants
│
├── public/
│   └── brand/
│       ├── nativz-logo-full.svg
│       ├── nativz-logo-mark.svg
│       └── nativz-logo-white.svg
│
├── middleware.ts                          # Auth + role enforcement
├── vercel.json                           # Cron configuration
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── .env.local
```

---

*This specification is designed to be used directly with Claude Code. Each section provides enough detail to build the corresponding feature. Start with Phase 1 and work through sequentially — each phase builds on the previous one.*
