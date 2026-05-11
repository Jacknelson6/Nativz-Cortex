/**
 * Resolve whether a (key, channel, client) tuple is enabled at runtime.
 *
 * Resolution order:
 *   1. Global notification_settings.enabled (migration 189) — if the
 *      admin has globally killed a notification, no brand can override.
 *   2. client_notification_settings.enabled (migration 273) — per-brand
 *      override per channel. Missing row defaults to true.
 *
 * Callers should pass the channel they are about to send on so the
 * brand-side toggle for that specific channel is what gets checked.
 * Example: the editing comment chat ping calls this with channel='chat'.
 * The follow-up email cron calls this with channel='email' inside the
 * per-recipient loop.
 *
 * `clientId` is nullable for callers that can't resolve a client (system
 * alerts, ops digests). When null we skip the per-client check entirely
 * and rely on the global gate only.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  getNotificationDefinition,
  type NotificationChannel,
} from './registry';
import { getNotificationSetting } from './get-setting';

interface ClientSettingRow {
  enabled: boolean;
}

export async function getClientNotificationSetting(
  key: string,
  channel: NotificationChannel,
  clientId: string | null,
): Promise<{ enabled: boolean }> {
  const def = getNotificationDefinition(key);
  // Unknown key: be conservative, treat as enabled so we don't silently
  // drop a sender that someone forgot to register. The admin UI surfaces
  // un-toggleable keys clearly enough.
  if (!def) return { enabled: true };

  // Channel that the registry claims this notification doesn't even
  // fire on shouldn't reach this helper, but if it does, treat as off
  // rather than silently true — that protects us from a typo wiring the
  // wrong channel into the gate.
  if (!def.channels[channel]) return { enabled: false };

  const global = await getNotificationSetting(key);
  if (!global.enabled) return { enabled: false };

  if (!clientId || !def.clientScoped) return { enabled: true };

  const admin = createAdminClient();
  const { data } = await admin
    .from('client_notification_settings')
    .select('enabled')
    .eq('client_id', clientId)
    .eq('notification_key', key)
    .eq('channel', channel)
    .maybeSingle<ClientSettingRow>();

  // Missing row = brand has never touched the toggle = default on.
  if (!data) return { enabled: true };
  return { enabled: data.enabled };
}
