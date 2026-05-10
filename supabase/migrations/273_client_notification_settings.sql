-- 273_client_notification_settings.sql
--
-- Per-client override layer for the global notification_settings table.
-- The global table (migration 189) controls the system-wide default for
-- every notification key. This table lets a single brand opt out of a
-- channel without affecting any other brand.
--
-- Resolution order at runtime (see `lib/notifications/get-client-setting.ts`):
--   1. global notification_settings.enabled   -> false: silent everywhere
--   2. per-client (client_id, key, channel)    -> false: silent for that brand
--   3. otherwise default true
--
-- We key by (client_id, notification_key, channel) so a brand can disable
-- the email digest of a notification while keeping the chat ping (or
-- vice-versa). `channel` is constrained to the values the UI exposes.

CREATE TABLE IF NOT EXISTS client_notification_settings (
  client_id          uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  notification_key   text NOT NULL,
  channel            text NOT NULL CHECK (channel IN ('chat', 'email')),
  enabled            boolean NOT NULL DEFAULT true,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (client_id, notification_key, channel)
);

CREATE INDEX IF NOT EXISTS client_notification_settings_key_idx
  ON client_notification_settings (notification_key, channel);

COMMENT ON TABLE client_notification_settings IS
  'Per-client overrides for notification toggles. Resolved on top of the global notification_settings row. Missing row = default enabled.';
COMMENT ON COLUMN client_notification_settings.channel IS
  'Which delivery channel the toggle controls. One of chat | email.';

ALTER TABLE client_notification_settings ENABLE ROW LEVEL SECURITY;

-- Admins manage these freely. Portal viewers don't see them yet (settings
-- page is admin-only). If we expose to portal later, add a viewer policy
-- scoped to user_client_access.
DROP POLICY IF EXISTS client_notification_settings_admin_all ON client_notification_settings;
CREATE POLICY client_notification_settings_admin_all
  ON client_notification_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (u.role = 'admin' OR u.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (u.role = 'admin' OR u.is_super_admin = true)
    )
  );
