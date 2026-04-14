-- 103_prospect_audits_analysis_data.sql
-- The suggest-competitors route + audit report client read/write an
-- `analysis_data` JSONB column on prospect_audits to store:
--   - suggested_competitors (LLM-picked competitor websites for the confirm screen)
--   - competitor_urls_override (user-edited competitor list)
--   - social_goals (goal checkboxes on the confirm screen)
--
-- The column was never created — all those features silently 500'd at
-- the SELECT step, which is why the confirm-platforms screen showed
-- empty competitor inputs and the fallback-tier discovery work never
-- actually ran. This migration adds the column with a sane default so
-- existing rows read as {}.

alter table public.prospect_audits
  add column if not exists analysis_data jsonb not null default '{}'::jsonb;

-- Lightweight index for the most common lookup (boards/hubs querying by
-- `analysis_data->>'status'` etc.) — partial to keep it tiny.
create index if not exists prospect_audits_analysis_data_gin_idx
  on public.prospect_audits using gin (analysis_data);
