/**
 * Resolve a notification's runtime setting (enabled flag + parameter overrides)
 * by joining the registry default with the notification_settings DB row.
 *
 * Senders should call this at the top of their handler:
 *
 *   const setting = await getNotificationSetting('calendar_comment_digest');
 *   if (!setting.enabled) return early;
 *   const windowHours = setting.params.windowHours as number;
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { getNotificationDefinition } from './registry';

export interface ResolvedNotificationSetting {
  key: string;
  enabled: boolean;
  params: Record<string, number | string | boolean | string[]>;
}

interface SettingRow {
  enabled: boolean;
  params: Record<string, unknown> | null;
}

export async function getNotificationSetting(key: string): Promise<ResolvedNotificationSetting> {
  const def = getNotificationDefinition(key);
  const defaults: Record<string, number | string | boolean | string[]> = {};
  if (def?.params) {
    for (const [paramKey, spec] of Object.entries(def.params)) {
      defaults[paramKey] = spec.default;
    }
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('notification_settings')
    .select('enabled, params')
    .eq('key', key)
    .maybeSingle<SettingRow>();

  if (!data) {
    return { key, enabled: true, params: defaults };
  }

  const merged: Record<string, number | string | boolean | string[]> = { ...defaults };
  if (data.params) {
    for (const [k, v] of Object.entries(data.params)) {
      if (v !== null && v !== undefined) {
        merged[k] = v as number | string | boolean | string[];
      }
    }
  }

  return {
    key,
    enabled: data.enabled,
    params: merged,
  };
}
