-- 170_brand_audits.sql — AEO-style self-audit runs.
-- ----------------------------------------------------------------------------
-- Asks N LLMs M prompts about a brand and captures whether the brand was
-- mentioned, the response sentiment, and any cited sources. The run-level
-- row holds rollup numbers (visibility, sentiment, source list, model
-- summary) plus the raw responses array so the detail UI can reconstruct
-- everything from a single row read.
--
-- Brand-scoped via attached_client_id (matches prospect_audits pattern).
-- Admin-only for now; portal access requires its own org-scoped policy
-- which we'll layer on if/when this surfaces in the client portal.

CREATE TABLE IF NOT EXISTS brand_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attached_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  brand_name TEXT NOT NULL,
  category TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),

  -- inputs
  prompts JSONB NOT NULL DEFAULT '[]'::jsonb,
  models  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- raw outputs: [{ prompt, model, response, mentioned, sentiment,
  --                 sources: [{url,title}], position, error? }]
  responses JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- aggregated rollup
  visibility_score    NUMERIC,                -- 0–100, % of prompts where brand appeared
  sentiment_score     NUMERIC,                -- -1.0 → 1.0
  sentiment_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb, -- { positive, neutral, negative }
  top_sources         JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ url, title, count }]
  model_summary       JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ model, mentioned_count, sentiment_avg, response_count }]

  error_message TEXT,

  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS brand_audits_attached_client_idx ON brand_audits (attached_client_id);
CREATE INDEX IF NOT EXISTS brand_audits_status_idx          ON brand_audits (status);
CREATE INDEX IF NOT EXISTS brand_audits_created_at_idx      ON brand_audits (created_at DESC);

ALTER TABLE brand_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage brand_audits" ON brand_audits;
CREATE POLICY "Admins manage brand_audits"
  ON brand_audits FOR ALL
  USING (true);
