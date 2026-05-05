-- Zernio webhook idempotency table.
--
-- Zernio docs: webhook delivery is at-least-once with up to 7 retry
-- attempts (immediate, 10s, 1m40s, 16m40s, 2h46m40s, then 24h x 2). The
-- same event ID can arrive multiple times for transient receiver errors,
-- redelivery, or after the dead-letter queue is drained. Without dedupe
-- the post.failed handler will fire admin notification emails twice for
-- the same incident, and the published handler can rerun reconcile on a
-- row that's already been corrected.
--
-- Pattern recommended by Zernio: insert the event ID into a unique-
-- indexed table before processing. If insert raises a unique-violation,
-- the event was already processed; respond 200 immediately.
--
-- TTL: 30 days. Zernio's longest retry window is ~26 hours; 30 days is
-- generous enough to cover redelivery from the dead-letter queue.

CREATE TABLE IF NOT EXISTS zernio_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zernio_webhook_events_received
  ON zernio_webhook_events (received_at);

-- RLS: this table is admin-only. No portal user should ever read it.
ALTER TABLE zernio_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON zernio_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
