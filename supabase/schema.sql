-- ============================================================
-- NATIVZ CORTEX — Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- ORGANIZATIONS & USERS
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('agency', 'client')),
  logo_url TEXT,
  primary_color TEXT DEFAULT '#000000',
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

-- CLIENTS
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  industry TEXT NOT NULL,
  category TEXT,
  description TEXT,
  logo_url TEXT,
  website_url TEXT,
  target_audience TEXT,
  brand_voice TEXT,
  topic_keywords TEXT[],
  social_sources TEXT[],
  meta_page_id TEXT,
  instagram_business_id TEXT,
  meta_access_token_encrypted TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  feature_flags JSONB DEFAULT '{"can_search": true, "can_view_reports": true, "can_edit_preferences": false, "can_submit_ideas": false}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- TOPIC SEARCHES (core table for the ideation feature)
CREATE TABLE topic_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  source TEXT NOT NULL,
  time_range TEXT NOT NULL,
  language TEXT NOT NULL,
  country TEXT NOT NULL,
  client_id UUID REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
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

CREATE INDEX idx_topic_searches_created ON topic_searches(created_at DESC);
CREATE INDEX idx_topic_searches_status ON topic_searches(status);
CREATE INDEX idx_topic_searches_user ON topic_searches(created_by);
CREATE INDEX idx_topic_searches_client ON topic_searches(client_id);
CREATE INDEX idx_topic_searches_approved ON topic_searches(approved_at);

-- COMPETITORS
CREATE TABLE competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  meta_page_id TEXT,
  instagram_handle TEXT,
  website_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SOCIAL LISTENING REPORTS
CREATE TABLE listening_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('manual', 'scheduled', 'alert')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  research_query TEXT NOT NULL,
  search_focus TEXT[],
  date_range_start DATE,
  date_range_end DATE,
  executive_summary TEXT,
  raw_ai_response JSONB,
  pain_points JSONB,
  trending_questions JSONB,
  language_dictionary JSONB,
  emotional_resonance_map JSONB,
  competitive_gaps JSONB,
  content_opportunities JSONB,
  overall_sentiment_score DECIMAL(3,2),
  sentiment_breakdown JSONB,
  tokens_used INTEGER,
  estimated_cost DECIMAL(10,4),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id)
);

-- HISTORICAL SENTIMENT TRACKING
CREATE TABLE sentiment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  report_id UUID REFERENCES listening_reports(id),
  snapshot_date DATE NOT NULL,
  overall_score DECIMAL(3,2),
  positive_pct DECIMAL(5,2),
  neutral_pct DECIMAL(5,2),
  negative_pct DECIMAL(5,2),
  emotions JSONB,
  top_themes TEXT[],
  top_pain_points TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CONTENT PERFORMANCE (Meta Graph API data)
CREATE TABLE meta_page_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'competitor')),
  competitor_id UUID REFERENCES competitors(id),
  snapshot_date DATE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  followers_count INTEGER,
  followers_change INTEGER,
  posts_count_period INTEGER,
  avg_likes DECIMAL(10,2),
  avg_comments DECIMAL(10,2),
  avg_shares DECIMAL(10,2),
  avg_engagement_rate DECIMAL(5,4),
  estimated_reach INTEGER,
  top_posts JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, entity_type, competitor_id, snapshot_date, platform)
);

CREATE TABLE meta_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'competitor')),
  competitor_id UUID REFERENCES competitors(id),
  platform TEXT NOT NULL,
  post_id TEXT NOT NULL,
  post_url TEXT,
  post_type TEXT,
  caption TEXT,
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  views INTEGER,
  engagement_rate DECIMAL(5,4),
  estimated_reach INTEGER,
  content_category TEXT,
  detected_themes TEXT[],
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, platform)
);

-- VIDEO IDEA PIPELINE
CREATE TABLE content_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  report_id UUID REFERENCES listening_reports(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target_emotion TEXT NOT NULL,
  suggested_format TEXT NOT NULL,
  source_insight TEXT NOT NULL,
  source_quote TEXT,
  content_type TEXT,
  estimated_virality TEXT CHECK (estimated_virality IN ('low', 'medium', 'high', 'viral_potential')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'idea' CHECK (status IN ('idea', 'approved', 'in_production', 'published', 'archived')),
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- INDEXES
CREATE INDEX idx_clients_org ON clients(organization_id);
CREATE INDEX idx_reports_client ON listening_reports(client_id);
CREATE INDEX idx_reports_status ON listening_reports(status);
CREATE INDEX idx_reports_created ON listening_reports(created_at DESC);
CREATE INDEX idx_sentiment_client_date ON sentiment_snapshots(client_id, snapshot_date DESC);
CREATE INDEX idx_meta_snapshots_client ON meta_page_snapshots(client_id, snapshot_date DESC);
CREATE INDEX idx_meta_posts_client ON meta_posts(client_id, published_at DESC);
CREATE INDEX idx_ideas_client ON content_ideas(client_id);
CREATE INDEX idx_ideas_status ON content_ideas(status);

-- ROW LEVEL SECURITY
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_page_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentiment_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY admin_all_clients ON clients FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Admins can do everything with topic_searches
CREATE POLICY admin_all_topic_searches ON topic_searches FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Portal users see only approved searches for their organization's clients
CREATE POLICY portal_approved_searches ON topic_searches FOR SELECT
  USING (
    approved_at IS NOT NULL
    AND client_id IN (
      SELECT c.id FROM clients c
      WHERE c.organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
    )
  );

-- Portal users can insert searches for their organization's clients
CREATE POLICY portal_insert_searches ON topic_searches FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND client_id IN (
      SELECT c.id FROM clients c
      WHERE c.organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
    )
  );

CREATE POLICY admin_all_reports ON listening_reports FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY admin_all_ideas ON content_ideas FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY admin_all_meta_snapshots ON meta_page_snapshots FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY admin_all_meta_posts ON meta_posts FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY admin_all_sentiment ON sentiment_snapshots FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY admin_all_competitors ON competitors FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Viewers can only see their organization's clients and related data
CREATE POLICY viewer_clients ON clients FOR SELECT
  USING (organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid()));

CREATE POLICY viewer_reports ON listening_reports FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
  ));

CREATE POLICY viewer_ideas ON content_ideas FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
  ));

CREATE POLICY viewer_meta_snapshots ON meta_page_snapshots FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
  ));

CREATE POLICY viewer_meta_posts ON meta_posts FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
  ));

CREATE POLICY viewer_sentiment ON sentiment_snapshots FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
  ));

CREATE POLICY viewer_competitors ON competitors FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE organization_id = (SELECT organization_id FROM users WHERE users.id = auth.uid())
  ));
