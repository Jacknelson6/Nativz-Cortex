-- Widen api_usage_logs.service to cover every provider the codebase logs.
-- Migration 178 added 'resend'; this adds 'openai' (direct OpenAI calls in
-- lib/ai/client.ts, lib/vault/indexer.ts, lib/ad-creatives/monthly-gift-ads.ts)
-- and 'dashscope' (lib/ai/video-analyzer.ts). Caption generation was failing
-- silently with constraint-violation log lines on every drop run.

ALTER TABLE api_usage_logs DROP CONSTRAINT IF EXISTS api_usage_logs_service_check;

ALTER TABLE api_usage_logs
  ADD CONSTRAINT api_usage_logs_service_check
  CHECK (service = ANY (ARRAY[
    'openrouter'::text,
    'groq'::text,
    'gemini'::text,
    'brave'::text,
    'resend'::text,
    'openai'::text,
    'dashscope'::text
  ]));
