-- Weekly affiliate digest email (UpPromote) — per-client opt-in + recipients.
-- Cron: /api/cron/weekly-affiliate-report (Wed UTC) syncs UpPromote then emails.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS affiliate_digest_email_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS affiliate_digest_recipients text NULL;

COMMENT ON COLUMN clients.affiliate_digest_email_enabled IS 'When true and UpPromote is connected, weekly digest cron may email affiliate_digest_recipients.';
COMMENT ON COLUMN clients.affiliate_digest_recipients IS 'Comma-separated recipient emails for the weekly affiliate performance digest.';

-- After deploy, enable per client (admin UI: Integrations → Weekly affiliate email), or e.g.:
-- UPDATE clients SET affiliate_digest_email_enabled = true,
--   affiliate_digest_recipients = 'cole@stealthhealthcontainers.com'
-- WHERE id = 'f0c0c328-8188-41dc-a7ab-67ca6d965a9e';
