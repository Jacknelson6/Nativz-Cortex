import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `getNotificationSetting` is what every sender (cron route or event handler)
 * calls before doing real work. Three contracts to pin:
 *
 *   1. Defaults from the registry are always applied. If a `notification_settings`
 *      row is missing entirely, the result still has the registry defaults
 *      filled in. A regression that returned `params: {}` would force every
 *      sender to re-implement default fallback or crash on `setting.params.foo`.
 *
 *   2. The result is `enabled: true` when there is no DB row. Default
 *      behavior is "on"; the row only exists once an admin has explicitly
 *      saved an override. A regression that defaulted to disabled would
 *      silently mute every notification on environments that haven't
 *      seeded the table.
 *
 *   3. DB params merge OVER defaults, but null/undefined values in the row
 *      DO NOT override the default. The settings UI persists partial JSON,
 *      and a half-saved override (`{ windowHours: null }`) must fall back
 *      to the registry default rather than passing null into the sender.
 */

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { getNotificationSetting } from './get-setting';
import { createAdminClient } from '@/lib/supabase/admin';

interface SettingRow {
  enabled: boolean;
  params: Record<string, unknown> | null;
}

function setup(opts: { row: SettingRow | null }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: opts.row });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const adminClient = { from };
  vi.mocked(createAdminClient).mockReturnValue(
    adminClient as unknown as ReturnType<typeof createAdminClient>,
  );
  return { from, select, eq, maybeSingle };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getNotificationSetting — no DB row', () => {
  it('defaults to enabled:true when the row is missing', async () => {
    setup({ row: null });
    const result = await getNotificationSetting('calendar_no_open_nudge');
    expect(result.enabled).toBe(true);
  });

  it('returns the registry param defaults when the row is missing', async () => {
    // calendar_no_open_nudge declares windowHours.default = 48
    setup({ row: null });
    const result = await getNotificationSetting('calendar_no_open_nudge');
    expect(result.params.windowHours).toBe(48);
  });

  it('echoes the requested key back on the result', async () => {
    setup({ row: null });
    const result = await getNotificationSetting('calendar_no_open_nudge');
    expect(result.key).toBe('calendar_no_open_nudge');
  });

  it('returns empty params object when the registry entry has no params', async () => {
    // topic_search_notify has no params
    setup({ row: null });
    const result = await getNotificationSetting('topic_search_notify');
    expect(result.params).toEqual({});
  });

  it('returns enabled:true with empty params for an unknown key', async () => {
    // Pin: unknown keys still resolve cleanly (enabled:true, no defaults to
    // pull from). A regression that threw would 500 every sender that
    // points at a renamed/removed registry entry instead of letting the
    // sender no-op.
    setup({ row: null });
    const result = await getNotificationSetting('does-not-exist');
    expect(result.enabled).toBe(true);
    expect(result.params).toEqual({});
  });
});

describe('getNotificationSetting — DB row present', () => {
  it('uses the row enabled flag (false → disabled)', async () => {
    setup({ row: { enabled: false, params: null } });
    const result = await getNotificationSetting('calendar_no_open_nudge');
    expect(result.enabled).toBe(false);
  });

  it('uses the row enabled flag (true → enabled)', async () => {
    setup({ row: { enabled: true, params: null } });
    const result = await getNotificationSetting('calendar_no_open_nudge');
    expect(result.enabled).toBe(true);
  });

  it('falls back to defaults when row.params is null', async () => {
    // Pin: `params null` means "no overrides," not "all values null."
    setup({ row: { enabled: false, params: null } });
    const result = await getNotificationSetting('calendar_no_open_nudge');
    expect(result.params.windowHours).toBe(48);
  });

  it('row params override the registry default', async () => {
    setup({ row: { enabled: true, params: { windowHours: 120 } } });
    const result = await getNotificationSetting('calendar_no_open_nudge');
    expect(result.params.windowHours).toBe(120);
  });

  it('row params merge ON TOP of defaults — un-set keys keep their default', async () => {
    // calendar_final_call declares hoursBeforeFirstPost.default = 24
    setup({ row: { enabled: true, params: { somethingElse: 'x' } } });
    const result = await getNotificationSetting('calendar_final_call');
    expect(result.params.hoursBeforeFirstPost).toBe(24);
    expect(result.params.somethingElse).toBe('x');
  });

  it('null values in row.params do NOT override the default', async () => {
    // Pin: half-saved overrides (`{ windowHours: null }`) must not pass
    // null into the sender — they should fall through to the registry
    // default instead.
    setup({ row: { enabled: true, params: { windowHours: null } } });
    const result = await getNotificationSetting('calendar_no_open_nudge');
    expect(result.params.windowHours).toBe(48);
  });

  it('undefined values in row.params do NOT override the default', async () => {
    setup({ row: { enabled: true, params: { windowHours: undefined } } });
    const result = await getNotificationSetting('calendar_no_open_nudge');
    expect(result.params.windowHours).toBe(48);
  });

  it('zero is a valid override (not treated as falsy)', async () => {
    // Defensive: a regression that wrote `if (v) merged[k] = v` would skip
    // 0/false/"" overrides. The current guard is `v !== null && v !== undefined`,
    // which lets 0 through.
    setup({ row: { enabled: true, params: { windowHours: 0 } } });
    const result = await getNotificationSetting('calendar_no_open_nudge');
    expect(result.params.windowHours).toBe(0);
  });

  it('false is a valid boolean override', async () => {
    setup({ row: { enabled: true, params: { someBool: false } } });
    const result = await getNotificationSetting('calendar_no_open_nudge');
    expect(result.params.someBool).toBe(false);
  });
});

describe('getNotificationSetting — DB query shape', () => {
  it('queries the notification_settings table', async () => {
    const { from } = setup({ row: null });
    await getNotificationSetting('calendar_no_open_nudge');
    expect(from).toHaveBeenCalledWith('notification_settings');
  });

  it('selects only enabled and params (no SELECT * fan-out)', async () => {
    const { select } = setup({ row: null });
    await getNotificationSetting('calendar_no_open_nudge');
    expect(select).toHaveBeenCalledWith('enabled, params');
  });

  it('filters by the requested key', async () => {
    const { eq } = setup({ row: null });
    await getNotificationSetting('calendar_no_open_nudge');
    expect(eq).toHaveBeenCalledWith('key', 'calendar_no_open_nudge');
  });

  it('uses .maybeSingle() so a missing row resolves to data:null instead of throwing', async () => {
    // Pin: `.single()` would throw on missing row, breaking every sender on
    // a fresh environment. `.maybeSingle()` is the right choice.
    const { maybeSingle } = setup({ row: null });
    await getNotificationSetting('calendar_no_open_nudge');
    expect(maybeSingle).toHaveBeenCalled();
  });
});
