-- 147_apify_runs.sql — cost + usage tracking for Apify scraper runs
-- ----------------------------------------------------------------------------
-- Every call to an Apify actor (Reddit, Web SERP, TikTok, YouTube, audit
-- scrapes, etc.) writes one row here after the run settles. Lets us:
--   * answer "how much did we spend on scrapers this month?"
--   * attribute cost to a client / topic_search for billing
--   * see which actors are expensive or flaky
--
-- `purpose` is a free-form string the caller sets (e.g. 'reddit', 'web_serp',
-- 'tiktok', 'meta_ads', 'audit_tiktok'). Keep it stable — it's used to group
-- spend in reports.

CREATE TABLE IF NOT EXISTS apify_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           text NOT NULL UNIQUE,
  actor_id         text NOT NULL,
  purpose          text NOT NULL,
  topic_search_id  uuid REFERENCES topic_searches(id) ON DELETE SET NULL,
  client_id        uuid REFERENCES clients(id)        ON DELETE SET NULL,
  status           text NOT NULL,
  cost_usd         numeric(10, 4),
  compute_units    numeric(10, 4),
  dataset_items    integer,
  duration_ms      integer,
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS apify_runs_topic_search_id_idx ON apify_runs(topic_search_id);
CREATE INDEX IF NOT EXISTS apify_runs_client_id_idx       ON apify_runs(client_id);
CREATE INDEX IF NOT EXISTS apify_runs_started_at_idx      ON apify_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS apify_runs_actor_id_idx        ON apify_runs(actor_id);
CREATE INDEX IF NOT EXISTS apify_runs_purpose_idx         ON apify_runs(purpose);

ALTER TABLE apify_runs ENABLE ROW LEVEL SECURITY;

-- Admin-only: viewers (portal clients) never see scraper cost rows.
CREATE POLICY apify_runs_admin_read ON apify_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  );

-- Writes come from server-side service-role client only; no INSERT/UPDATE
-- policy for authenticated users. Service role bypasses RLS.
