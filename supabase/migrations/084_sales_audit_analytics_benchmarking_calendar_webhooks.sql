-- Migration 084: Sales Audit, Analytics Benchmarking, Calendar Revision Webhooks
-- Phase 1: Sales Audit Tool
-- Phase 2: Analytics Benchmarking (competitor tracking + snapshots)
-- Phase 3: Calendar revision webhook URL on clients

-- ============================================================
-- Phase 1: Sales Audit
-- ============================================================

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

-- ============================================================
-- Phase 2: Analytics Benchmarking
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_client_competitors_client ON client_competitors(client_id);

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

CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_competitor ON competitor_snapshots(competitor_id, scraped_at DESC);

-- ============================================================
-- Phase 3: Calendar Revision Webhooks
-- ============================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS revision_webhook_url TEXT;
