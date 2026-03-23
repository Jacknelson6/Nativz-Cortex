-- Per-client schedule for weekly affiliate digest (cron runs every 15m; matcher uses these fields).
-- Defaults preserve previous behavior: Wednesday 14:00 UTC.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS affiliate_digest_timezone text NOT NULL DEFAULT 'UTC';

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS affiliate_digest_send_day_of_week smallint NOT NULL DEFAULT 3;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS affiliate_digest_send_hour smallint NOT NULL DEFAULT 14;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS affiliate_digest_send_minute smallint NOT NULL DEFAULT 0;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS affiliate_digest_last_sent_week_key text NULL;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_affiliate_digest_send_day_of_week_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_affiliate_digest_send_day_of_week_check
  CHECK (affiliate_digest_send_day_of_week >= 0 AND affiliate_digest_send_day_of_week <= 6);

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_affiliate_digest_send_hour_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_affiliate_digest_send_hour_check
  CHECK (affiliate_digest_send_hour >= 0 AND affiliate_digest_send_hour <= 23);

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_affiliate_digest_send_minute_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_affiliate_digest_send_minute_check
  CHECK (affiliate_digest_send_minute >= 0 AND affiliate_digest_send_minute <= 59);

COMMENT ON COLUMN clients.affiliate_digest_timezone IS 'IANA timezone for digest send window (e.g. America/New_York).';
COMMENT ON COLUMN clients.affiliate_digest_send_day_of_week IS '0=Sunday … 6=Saturday in affiliate_digest_timezone.';
COMMENT ON COLUMN clients.affiliate_digest_send_hour IS 'Local hour 0–23 in affiliate_digest_timezone.';
COMMENT ON COLUMN clients.affiliate_digest_send_minute IS 'Local minute 0–59; matched on 15-minute cron buckets.';
COMMENT ON COLUMN clients.affiliate_digest_last_sent_week_key IS 'ISO week key YYYY-Www when digest last sent (cron); avoids duplicate sends.';
