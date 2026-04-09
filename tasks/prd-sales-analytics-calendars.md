# PRD: Sales Audit + Analytics Overhaul + Calendar Revisions

> Three-phase feature set. Each phase is independent and can be built in parallel.

---

## Phase 1: Sales Audit Tool

**Goal:** Analyze a prospect's TikTok presence, identify competitors, and generate a red/green scorecard showing what they're doing well vs poorly — giving the sales team concrete talking points.

### Flow
1. Admin pastes a TikTok profile URL (e.g. `tiktok.com/@brandname`)
2. System prompts for website URL for business context
3. System scrapes both via Apify (TikTok profile) + web crawler (website)
4. AI identifies competitors on TikTok based on industry/niche
5. System scrapes competitor profiles via Apify
6. AI generates audit scorecard with green/red indicators

### UI
- Mirrors the research topic search flow at `/admin/search/new`
- Input: paste TikTok URL → prompted for website URL → generates report live
- Report: visually similar to research search results — card-based, scrollable sections
- Scorecard: green dots (doing well) / red dots (needs improvement) for prospect + competitors
- No prescriptive advice — just highlights strengths and weaknesses

### Technical
- **Route:** `/admin/audit/new` (input form), `/admin/audit/[id]` (report)
- **API:** `POST /api/audit/start`, `GET /api/audit/[id]`, `POST /api/audit/[id]/process`
- **Apify:** TikTok profile scraper (`clockworks/free-tiktok-scraper`) for profile data + recent videos
- **Website:** Brave Search / fetch + parse for business context
- **AI:** Claude via OpenRouter to identify competitors, analyze engagement, generate scorecard
- **DB:** `prospect_audits` table (id, tiktok_url, website_url, status, prospect_data, competitors_data, scorecard, created_by, created_at)
- **Sidebar:** Add "Sales audit" under Content section

### Scorecard Criteria (initial — can be refined)
- Posting frequency (daily/weekly/monthly)
- Average engagement rate (likes+comments / followers)
- Hashtag strategy (branded, trending, niche)
- Content variety (hooks, formats, topics)
- Bio optimization (CTA, links, description)
- Follower growth trend
- Video quality indicators (duration, thumbnails)
- Response to comments / community engagement

---

## Phase 2: Analytics Overhaul

### 2A: UI Consolidation
- **Merge** social media + affiliate analytics into one page at `/admin/analytics`
- **Tab switching**: Social media | Affiliates (future: Paid media)
- **Client portfolio selector** as landing view before showing any data
- Each client card shows green dot (connected) or yellow dot (not connected/paused)
- Standardize the client portfolio selector component for reuse site-wide

### 2B: Benchmarking
- Per-client competitor list stored in DB
- **Add competitors:** manual TikTok URL entry OR AI-assisted discovery
- **Scrape competitors:** Apify for public profile data (followers, engagement, recent posts, video topics)
- **Snapshots:** Store periodic data in Supabase (`competitor_snapshots` table)
- **Historical charts:** Line/area charts showing follower growth, engagement rate over time
- **Manual refresh only** (no cron) — admin clicks "Refresh" to re-scrape
- **Reports:** AI-generated summary of competitor content trends

### Technical
- **Route:** `/admin/analytics` (portfolio selector → tab view)
- **DB tables:**
  - `client_competitors` (id, client_id, platform, profile_url, username, display_name, avatar_url, added_by, added_at)
  - `competitor_snapshots` (id, competitor_id, followers, following, posts_count, avg_engagement_rate, avg_views, recent_videos jsonb, scraped_at)
- **API:**
  - `GET/POST /api/analytics/competitors` — list/add competitors for a client
  - `POST /api/analytics/competitors/[id]/refresh` — trigger Apify scrape + snapshot
  - `POST /api/analytics/competitors/discover` — AI-assisted competitor discovery
  - `DELETE /api/analytics/competitors/[id]` — remove competitor
- **Component:** `ClientPortfolioSelector` — reusable bento grid of client cards with status dots

---

## Phase 3: Calendar Share Revisions → Webhook

**Goal:** When a client leaves a revision comment on a shared calendar, send a webhook notification to a configurable destination (Google Chat).

### What exists
- Shared calendar page at `/shared/calendar/[token]` ✅
- Feedback API at `/api/scheduler/share/feedback` ✅
- Comments with approved/changes_requested/comment statuses ✅

### What's needed
- **Webhook dispatch** on feedback submission — POST to configurable URL
- **Admin setting** for webhook destination URL per client (or global)
- **Google Chat webhook format** — `{ text: "..." }` payload
- **Settings UI** — small section in client settings or scheduler settings: "Where do revision notifications get posted?"

### Technical
- **DB:** Add `revision_webhook_url` column to `clients` table (or new `webhook_settings` table)
- **API:** Modify `/api/scheduler/share/feedback` to fire webhook after comment insertion
- **Settings:** Add webhook URL field to client settings page
- **Payload:** Include client name, post caption, reviewer name, comment text, status, link to post

---

## Migration: `084_sales_audit_analytics_benchmarking_calendar_webhooks.sql`

```sql
-- Sales Audit
CREATE TABLE IF NOT EXISTS prospect_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_url TEXT NOT NULL,
  website_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  prospect_data JSONB DEFAULT '{}',
  competitors_data JSONB DEFAULT '[]',
  scorecard JSONB DEFAULT '{}',
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE prospect_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can do everything on prospect_audits"
  ON prospect_audits FOR ALL USING (true);

-- Analytics Benchmarking
CREATE TABLE IF NOT EXISTS client_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'tiktok' CHECK (platform IN ('tiktok', 'instagram', 'facebook', 'youtube')),
  profile_url TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE client_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can do everything on client_competitors"
  ON client_competitors FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES client_competitors(id) ON DELETE CASCADE,
  followers INTEGER DEFAULT 0,
  following INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  avg_engagement_rate NUMERIC(6,4) DEFAULT 0,
  avg_views INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  recent_videos JSONB DEFAULT '[]',
  content_topics JSONB DEFAULT '[]',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE competitor_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can do everything on competitor_snapshots"
  ON competitor_snapshots FOR ALL USING (true);

CREATE INDEX idx_competitor_snapshots_competitor ON competitor_snapshots(competitor_id, scraped_at DESC);
CREATE INDEX idx_client_competitors_client ON client_competitors(client_id);

-- Calendar Revision Webhooks
ALTER TABLE clients ADD COLUMN IF NOT EXISTS revision_webhook_url TEXT;
```
