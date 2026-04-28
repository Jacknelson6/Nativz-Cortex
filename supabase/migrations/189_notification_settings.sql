-- ──────────────────────────────────────────────────────────────────────
-- 189: Notification settings registry
-- ──────────────────────────────────────────────────────────────────────
-- Every cron-driven and event-driven email/notification we send is
-- registered in code (lib/notifications/registry.ts). This table holds
-- the runtime overrides admins can flip from /admin/settings → Notifications:
--   • enabled — kill switch (defaults to true via getNotificationSetting)
--   • params  — knobs the notification reads at runtime (e.g. windowHours
--     for the calendar reminder cadence). Code-level defaults live in the
--     registry; this row only holds explicit overrides.
--
-- We keep schedules in vercel.json (build-time) since changing cron expr
-- at runtime would require a self-dispatching meta-cron. Disabling a
-- notification here causes its handler to no-op early.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_settings (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage notification settings"
  ON notification_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = true)
    )
  );

CREATE OR REPLACE FUNCTION notification_settings_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_settings_touch_updated_at ON notification_settings;
CREATE TRIGGER notification_settings_touch_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW EXECUTE FUNCTION notification_settings_touch_updated_at();
