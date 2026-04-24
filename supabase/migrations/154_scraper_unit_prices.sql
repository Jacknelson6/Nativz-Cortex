-- Live per-unit pricing for scraper platforms. Populated by
-- POST /api/admin/scraper-settings/refresh-pricing which computes
-- mean(cost_usd / dataset_items) across recent apify_runs and stores the
-- result as the authoritative per-unit price for each platform. The hardcoded
-- defaults in lib/search/scraper-cost-constants.ts remain as fallback when
-- no refreshed row exists yet.

CREATE TABLE IF NOT EXISTS scraper_unit_prices (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  reddit_price_per_unit numeric(10, 6) NOT NULL DEFAULT 0.0005,
  youtube_price_per_unit numeric(10, 6) NOT NULL DEFAULT 0.0005,
  tiktok_price_per_unit numeric(10, 6) NOT NULL DEFAULT 0.0003,
  web_price_per_unit numeric(10, 6) NOT NULL DEFAULT 0.0,
  refreshed_at timestamptz,
  source jsonb  -- optional: {reddit: {runs: 42, avg_cost: 0.00048, actor: 'trudax/reddit-scraper-lite'}}
);

INSERT INTO scraper_unit_prices (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE scraper_unit_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read scraper_unit_prices" ON scraper_unit_prices;
CREATE POLICY "Admins read scraper_unit_prices"
  ON scraper_unit_prices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid()
        AND (users.role = 'admin' OR users.is_super_admin = true)
    )
  );
