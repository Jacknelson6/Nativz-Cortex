-- 132_ad_assets.sql — Per-client asset library for the Ad Generator
-- ----------------------------------------------------------------------------
-- The Ad Generator needs a first-class place to stash references that feed
-- grounded generation: winning-ad screenshots, product shots, competitor ads
-- downloaded from the wild, offer briefs, alternate logos, etc. The chat
-- surface can attach them ad-hoc per turn, but we want persistent,
-- taggable, per-client folders so the same reference set can be reused
-- across batches without re-uploading.
--
-- This migration lands the schema + storage bucket + RLS. The UI that reads
-- and writes these rows ships in the Phase 1 page rebuild.

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Coarse bucket so the UI can filter by intent. Values are not a strict
  -- enum on purpose — agencies invent categories we can't predict. 'other'
  -- is the fallback and the UI shows a free-text label for it.
  kind TEXT NOT NULL DEFAULT 'other'
    CHECK (kind IN (
      'winning-ad',        -- Competitor or internal ad we want to echo
      'product-shot',      -- Clean product photography
      'competitor',        -- Competitor creative, for reference/contrast
      'logo-alt',          -- Alternate logo variants beyond the canonical one
      'offer-brief',       -- PDF/text describing the current offer
      'review-screenshot', -- Five-star review, testimonial screenshot, etc.
      'other'
    )),

  label TEXT NOT NULL,           -- Short human label ("Sarah K 5-star", "Q2 40%-off hero")
  notes TEXT,                    -- Optional longer description / grounding hint for the AI

  -- Storage coordinates. `storage_path` is the key inside the `ad-assets`
  -- bucket; `mime_type` + `byte_size` let the UI render correctly and
  -- catch oversized uploads client-side before a round-trip.
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  byte_size BIGINT,
  width INT,
  height INT,

  -- Free-text tags — the chat agent uses these to select assets by
  -- concept. Stored as text[] rather than a join table because the cost
  -- of a dedicated tag table isn't worth it for a per-client asset set
  -- that rarely exceeds a few hundred items.
  tags TEXT[] NOT NULL DEFAULT '{}',

  -- Who uploaded it (auth.users id). Nullable because migrations, seed
  -- scripts, and service-role imports don't have a user context.
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_assets_client_id ON ad_assets(client_id);
CREATE INDEX IF NOT EXISTS idx_ad_assets_client_kind ON ad_assets(client_id, kind);
CREATE INDEX IF NOT EXISTS idx_ad_assets_client_created ON ad_assets(client_id, created_at DESC);

-- updated_at touch trigger (reuses the app-wide helper if it exists; inline
-- the function here as a no-op-safe CREATE OR REPLACE so this migration
-- can run standalone on a fresh DB)
CREATE OR REPLACE FUNCTION set_ad_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ad_assets_updated_at ON ad_assets;
CREATE TRIGGER trg_ad_assets_updated_at
  BEFORE UPDATE ON ad_assets
  FOR EACH ROW
  EXECUTE FUNCTION set_ad_assets_updated_at();

-- ----------------------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------------------
-- Admin-scoped surface. Only admins / super_admins can read, write, delete.
-- Portal users don't touch the asset library at this stage. If that changes,
-- we'll layer a `user_client_access`-scoped SELECT policy for viewers.
ALTER TABLE ad_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can select ad_assets"
  ON ad_assets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

CREATE POLICY "admins can insert ad_assets"
  ON ad_assets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

CREATE POLICY "admins can update ad_assets"
  ON ad_assets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

CREATE POLICY "admins can delete ad_assets"
  ON ad_assets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Storage bucket
-- ----------------------------------------------------------------------------
-- Bucket is PUBLIC so <img src=...> works without signed URLs in the admin
-- UI. Asset library is admin-only, but the files are low-sensitivity
-- (public competitor ads, product shots from client's own site, etc.) —
-- not worth the signed-url overhead. If we start housing truly sensitive
-- briefs here, flip the bucket to private and issue short-lived signed
-- URLs from an API route.
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-assets', 'ad-assets', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Storage object policies — mirror the table-level admin-only posture.
CREATE POLICY "admins can upload ad-assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ad-assets'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

CREATE POLICY "admins can update ad-assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'ad-assets'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

CREATE POLICY "admins can delete ad-assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ad-assets'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

CREATE POLICY "anyone can read ad-assets"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'ad-assets');
