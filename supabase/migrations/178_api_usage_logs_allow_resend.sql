-- Allow `service = 'resend'` in api_usage_logs.
-- lib/email/resend.ts has called trackUsage({ service: 'resend' }) since
-- migration 129 wired the editable Resend secret, but the CHECK constraint
-- still only listed the four AI providers. Every email send was emitting
-- a constraint-violation log line. Widen the constraint to include 'resend'.

ALTER TABLE api_usage_logs DROP CONSTRAINT IF EXISTS api_usage_logs_service_check;

ALTER TABLE api_usage_logs
  ADD CONSTRAINT api_usage_logs_service_check
  CHECK (service = ANY (ARRAY['openrouter'::text, 'groq'::text, 'gemini'::text, 'brave'::text, 'resend'::text]));
