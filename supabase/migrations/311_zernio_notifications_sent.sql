-- Unified dedup ledger for all Zernio-originated notifications.
--
-- Today every notification path has its own dedup mechanism:
--
--   * post.failed in-app notifies → scheduled_posts.failure_notification_sent_at
--   * stuck-publishing chat cards → scheduled_posts.stuck_publishing_alerted_at
--   * connection-expired chat cards → social_profiles.disconnect_alerted_at
--   * partial-failure in-app notifies → scheduled_posts.failure_notification_sent_at
--
-- Four different columns on two different tables, each with its own
-- reset semantics. Adding a new notification type means inventing yet
-- another column. This table consolidates: (kind, target_id) is the
-- primary key, so the very first insert wins and any retry returns a
-- 23505 unique-violation that the unified `notifyZernio` helper maps
-- to `sent: false, reason: 'already_notified'`.
--
-- The legacy per-column sentinels stay for now (per the PRD's "no big
-- bang" guidance) — new code routes through this table; old helpers
-- are unchanged.

CREATE TABLE IF NOT EXISTS zernio_notifications_sent (
  kind text NOT NULL,
  target_id text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  context jsonb NULL,
  PRIMARY KEY (kind, target_id)
);

-- Forensic browsing: most-recent-first across all kinds.
CREATE INDEX IF NOT EXISTS idx_zernio_notifications_sent_sent_at
  ON zernio_notifications_sent (sent_at DESC);

COMMENT ON TABLE zernio_notifications_sent IS
  'Unified dedup ledger for Zernio-originated notifications. PK (kind, target_id) blocks duplicate sends across webhook/cron/publish paths. Clearing a row re-arms the channel (e.g. successful republish removes the post_failed row).';

ALTER TABLE zernio_notifications_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zernio_notifications_sent admin all"
  ON zernio_notifications_sent
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  );
