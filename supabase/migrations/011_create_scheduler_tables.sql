-- Autopost scheduler tables

-- Social profiles connected via posting provider (Late)
CREATE TABLE IF NOT EXISTS social_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'youtube')),
  platform_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT,
  access_token_ref TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_profiles_client ON social_profiles(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_profiles_platform_user ON social_profiles(platform, platform_user_id);

-- Scheduled posts
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'partially_failed', 'failed')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  caption TEXT DEFAULT '',
  hashtags TEXT[] DEFAULT '{}',
  cover_image_url TEXT,
  tagged_people TEXT[] DEFAULT '{}',
  collaborator_handles TEXT[] DEFAULT '{}',
  post_type TEXT DEFAULT 'reel' CHECK (post_type IN ('reel', 'short', 'video')),
  external_post_id TEXT,
  failure_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_client ON scheduled_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_at ON scheduled_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_publish_queue ON scheduled_posts(status, scheduled_at)
  WHERE status = 'scheduled';

-- Junction: which platforms a post targets
CREATE TABLE IF NOT EXISTS scheduled_post_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  social_profile_id UUID NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'failed')),
  external_post_id TEXT,
  external_post_url TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spp_post ON scheduled_post_platforms(post_id);
CREATE INDEX IF NOT EXISTS idx_spp_profile ON scheduled_post_platforms(social_profile_id);

-- Media library for scheduler
CREATE TABLE IF NOT EXISTS scheduler_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds NUMERIC,
  file_size_bytes BIGINT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_media_client ON scheduler_media(client_id);

-- Junction: media attached to posts
CREATE TABLE IF NOT EXISTS scheduled_post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES scheduler_media(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_spm_post ON scheduled_post_media(post_id);

-- Saved caption templates
CREATE TABLE IF NOT EXISTS saved_captions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  title TEXT NOT NULL,
  caption_text TEXT NOT NULL DEFAULT '',
  hashtags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_captions_client ON saved_captions(client_id);

-- Share links for client review
CREATE TABLE IF NOT EXISTS post_review_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_review_links_token ON post_review_links(token);

-- Comments on review links
CREATE TABLE IF NOT EXISTS post_review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_link_id UUID NOT NULL REFERENCES post_review_links(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT 'Anonymous',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'comment' CHECK (status IN ('approved', 'changes_requested', 'comment')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_review_comments_link ON post_review_comments(review_link_id);

-- Add default_posting_time to clients table for per-client scheduling defaults
ALTER TABLE clients ADD COLUMN IF NOT EXISTS default_posting_time TIME;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS default_posting_timezone TEXT;

-- RLS policies
ALTER TABLE social_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_post_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduler_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_captions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_review_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_review_comments ENABLE ROW LEVEL SECURITY;

-- Admin (authenticated) can do everything on scheduler tables
CREATE POLICY "Authenticated users can manage social_profiles"
  ON social_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage scheduled_posts"
  ON scheduled_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage scheduled_post_platforms"
  ON scheduled_post_platforms FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage scheduler_media"
  ON scheduler_media FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage scheduled_post_media"
  ON scheduled_post_media FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage saved_captions"
  ON saved_captions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage post_review_links"
  ON post_review_links FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Review comments: public insert (no auth needed for client reviews), authenticated read
CREATE POLICY "Anyone can insert review comments"
  ON post_review_comments FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read review comments"
  ON post_review_comments FOR SELECT TO authenticated USING (true);

-- Service role bypasses RLS for cron jobs
