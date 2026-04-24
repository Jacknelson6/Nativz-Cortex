-- 161_api_usage_logs_reconciliation_indexes.sql
--
-- Two safety indexes on api_usage_logs that the OpenRouter generation
-- webhook depends on at scale.
--
-- 1. A GIN index on the `metadata` JSONB column so the webhook's
--    `contains` lookup ({openrouter_generation_id: '...'}) stays O(log n)
--    as the table grows. Without this, every webhook POST does a full
--    table scan, which is cheap at 100 rows and painful at 100k.
--
-- 2. A UNIQUE partial index on `metadata->>'openrouter_generation_id'`.
--    The webhook is naturally idempotent (OpenRouter retries on 5xx /
--    timeout), and Postgres enforcing uniqueness at the index level is
--    cheaper + more correct than the race-prone SELECT-then-INSERT
--    pattern in the handler. Partial (WHERE … IS NOT NULL) so rows
--    without a generation id stay insert-free.

-- 1) JSONB GIN index — speeds up the webhook's contains() match.
CREATE INDEX IF NOT EXISTS api_usage_logs_metadata_gin_idx
  ON public.api_usage_logs
  USING GIN (metadata);

-- 2) Unique partial index — prevents duplicate rows on webhook retry.
--    `->>` extracts the text value at the key, which NULLs out when the
--    key is absent. Partial index on IS NOT NULL keeps the rest of the
--    table free of false uniqueness conflicts.
CREATE UNIQUE INDEX IF NOT EXISTS api_usage_logs_openrouter_generation_id_uidx
  ON public.api_usage_logs ((metadata->>'openrouter_generation_id'))
  WHERE metadata->>'openrouter_generation_id' IS NOT NULL;

INSERT INTO public.schema_migrations (filename, applied_at)
VALUES ('161_api_usage_logs_reconciliation_indexes.sql', now())
ON CONFLICT DO NOTHING;
