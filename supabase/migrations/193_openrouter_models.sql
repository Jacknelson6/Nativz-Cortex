-- 193_openrouter_models.sql
-- Cache of OpenRouter's /api/v1/models response. Refreshed twice monthly by
-- /api/cron/refresh-openrouter-models so the catalog dropdown and the
-- topic-search LLM cost estimator never hit OpenRouter on the request path.
--
-- The OpenRouter id is the natural primary key — stable across deploys.
-- Pricing is stored per-1M-tokens to match the API surface in our
-- `OpenRouterModel` type. -1 means "variable pricing" (auto-router models)
-- and is preserved verbatim so callers can choose to hide them.

CREATE TABLE IF NOT EXISTS openrouter_models (
  id                       text PRIMARY KEY,
  name                     text NOT NULL,
  description              text,
  context_length           int,
  input_modalities         text[]   NOT NULL DEFAULT ARRAY[]::text[],
  output_modalities        text[]   NOT NULL DEFAULT ARRAY[]::text[],
  prompt_price_per_m       numeric,           -- -1 = variable, null = unknown
  completion_price_per_m   numeric,
  is_free                  boolean  NOT NULL DEFAULT false,
  is_variable              boolean  NOT NULL DEFAULT false,
  raw                      jsonb    NOT NULL DEFAULT '{}'::jsonb,
  synced_at                timestamptz NOT NULL DEFAULT now()
);

-- Catalog dropdown sorts free-first then alpha; that lookup is cheap on
-- ~250 rows but the index on synced_at lets us cheaply answer "is the cache
-- stale?" without scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_openrouter_models_synced_at
  ON openrouter_models (synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_openrouter_models_is_free
  ON openrouter_models (is_free);

-- RLS — admin-only. The catalog is sensitive in the sense that exposing
-- pricing via an unscoped read would leak business-cost detail; keep it
-- gated to admins (the API routes use the service role anyway).
ALTER TABLE openrouter_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "openrouter_models admin all" ON openrouter_models;
CREATE POLICY "openrouter_models admin all"
  ON openrouter_models
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role = 'admin' OR users.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role = 'admin' OR users.is_super_admin = true)
    )
  );
