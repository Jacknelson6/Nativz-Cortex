'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TimePicker15 } from '@/components/ui/time-picker-15';
import { cn } from '@/lib/utils/cn';
import {
  AFFILIATE_DIGEST_CUSTOM_TIMEZONE,
  AFFILIATE_DIGEST_TIMEZONE_PRESETS,
} from '@/lib/affiliates/digest-timezone-presets';
import { isValidIanaTimeZone } from '@/lib/affiliates/digest-schedule';

const ROW_CLASS =
  'flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function hourMinuteToTimeValue(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function parseTimeValue(v: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hour = Number.parseInt(m[1], 10);
  const minute = Number.parseInt(m[2], 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function timezonePresetForStored(tz: string): { preset: string; custom: string } {
  const t = tz?.trim() || 'UTC';
  if (AFFILIATE_DIGEST_TIMEZONE_PRESETS.some((p) => p.value === t)) {
    return { preset: t, custom: '' };
  }
  return { preset: AFFILIATE_DIGEST_CUSTOM_TIMEZONE, custom: t };
}

type AffiliateWeeklyDigestSettingsProps = {
  clientId: string;
  upPromoteConnected: boolean;
  affiliateDigestEnabled?: boolean;
  affiliateDigestRecipients?: string | null;
  affiliateDigestTimezone?: string;
  affiliateDigestSendDayOfWeek?: number;
  affiliateDigestSendHour?: number;
  affiliateDigestSendMinute?: number;
  affiliateDigestLastSentWeekKey?: string | null;
  onSaved?: () => void;
  /** When false, omit outer Card wrapper (e.g. nested inside another card). */
  withCard?: boolean;
};

/**
 * Weekly UpPromote digest: recipients, opt-in, time zone, weekday, and local send time.
 */
export function AffiliateWeeklyDigestSettings({
  clientId,
  upPromoteConnected,
  affiliateDigestEnabled = false,
  affiliateDigestRecipients = '',
  affiliateDigestTimezone = 'UTC',
  affiliateDigestSendDayOfWeek = 3,
  affiliateDigestSendHour = 14,
  affiliateDigestSendMinute = 0,
  affiliateDigestLastSentWeekKey = null,
  onSaved,
  withCard = true,
}: AffiliateWeeklyDigestSettingsProps) {
  const [digestEnabled, setDigestEnabled] = useState(affiliateDigestEnabled);
  const [digestRecipients, setDigestRecipients] = useState(affiliateDigestRecipients ?? '');
  const [timezonePreset, setTimezonePreset] = useState(() =>
    timezonePresetForStored(affiliateDigestTimezone).preset,
  );
  const [timezoneCustom, setTimezoneCustom] = useState(() =>
    timezonePresetForStored(affiliateDigestTimezone).custom,
  );
  const [sendDay, setSendDay] = useState(affiliateDigestSendDayOfWeek);
  const [timeValue, setTimeValue] = useState(
    hourMinuteToTimeValue(affiliateDigestSendHour, affiliateDigestSendMinute),
  );
  const [savingDigest, setSavingDigest] = useState(false);

  useEffect(() => {
    setDigestEnabled(affiliateDigestEnabled);
    setDigestRecipients(affiliateDigestRecipients ?? '');
    const { preset, custom } = timezonePresetForStored(affiliateDigestTimezone);
    setTimezonePreset(preset);
    setTimezoneCustom(custom);
    setSendDay(affiliateDigestSendDayOfWeek);
    setTimeValue(hourMinuteToTimeValue(affiliateDigestSendHour, affiliateDigestSendMinute));
  }, [
    affiliateDigestEnabled,
    affiliateDigestRecipients,
    affiliateDigestTimezone,
    affiliateDigestSendDayOfWeek,
    affiliateDigestSendHour,
    affiliateDigestSendMinute,
  ]);

  const resolvedTimezone = useMemo(() => {
    if (timezonePreset === AFFILIATE_DIGEST_CUSTOM_TIMEZONE) {
      return timezoneCustom.trim() || 'UTC';
    }
    return timezonePreset;
  }, [timezonePreset, timezoneCustom]);

  async function handleSaveDigest() {
    const parsed = parseTimeValue(timeValue);
    if (!parsed) {
      toast.error('Use a valid time (HH:MM, 24-hour).');
      return;
    }
    if (!isValidIanaTimeZone(resolvedTimezone)) {
      toast.error('Choose a valid IANA time zone or pick a preset.');
      return;
    }
    setSavingDigest(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affiliate_digest_email_enabled: digestEnabled,
          affiliate_digest_recipients: digestRecipients.trim() || null,
          affiliate_digest_timezone: resolvedTimezone,
          affiliate_digest_send_day_of_week: sendDay,
          affiliate_digest_send_hour: parsed.hour,
          affiliate_digest_send_minute: parsed.minute,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error ?? 'Failed to save');
        return;
      }
      toast.success('Affiliate email settings saved');
      onSaved?.();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingDigest(false);
    }
  }

  const inner = (
    <>
      {!upPromoteConnected ? (
        <p className="text-sm text-text-muted">
          Connect UpPromote in client settings to enable the weekly affiliate digest email.
        </p>
      ) : (
        <div className={`${ROW_CLASS} flex-col items-stretch gap-3`}>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Mail size={16} className="text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">Weekly affiliate email</p>
              <p className="text-xs text-text-muted">
                Past seven days of UpPromote metrics. A sync runs before each send. The job runs every 15 minutes and
                sends once per ISO week when your day and time match in the chosen time zone.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={digestEnabled}
              onChange={(e) => setDigestEnabled(e.target.checked)}
              className="rounded border-nativz-border bg-surface-hover"
            />
            <span className="text-sm text-text-primary">Send weekly digest</span>
          </label>
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted">Recipients (comma-separated)</label>
            <input
              type="text"
              value={digestRecipients}
              onChange={(e) => setDigestRecipients(e.target.value)}
              placeholder="name@company.com"
              disabled={!digestEnabled}
              className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20 disabled:opacity-50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted">Time zone</label>
            <select
              value={timezonePreset}
              onChange={(e) => setTimezonePreset(e.target.value)}
              disabled={!digestEnabled}
              className="w-full max-w-md rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20 disabled:opacity-50"
            >
              {AFFILIATE_DIGEST_TIMEZONE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value={AFFILIATE_DIGEST_CUSTOM_TIMEZONE}>Custom (IANA)…</option>
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">Day of week</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Day of week">
              {WEEKDAY_SHORT.map((label, value) => (
                <button
                  key={label}
                  type="button"
                  disabled={!digestEnabled}
                  onClick={() => setSendDay(value)}
                  className={cn(
                    'min-w-[2.75rem] rounded-lg px-2 py-2 text-xs font-medium transition-colors',
                    sendDay === value
                      ? 'bg-accent text-white shadow-sm'
                      : 'border border-nativz-border bg-surface-hover text-text-secondary hover:border-accent/30 hover:text-text-primary',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {timezonePreset === AFFILIATE_DIGEST_CUSTOM_TIMEZONE && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-muted">Custom IANA time zone</label>
              <input
                type="text"
                value={timezoneCustom}
                onChange={(e) => setTimezoneCustom(e.target.value)}
                placeholder="e.g. America/Toronto"
                disabled={!digestEnabled}
                className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20 disabled:opacity-50"
              />
            </div>
          )}
          <div className="space-y-1 max-w-xs">
            <label htmlFor="affiliate-digest-send-time" className="text-xs font-medium text-text-muted">
              Send time (local to time zone)
            </label>
            <TimePicker15
              id="affiliate-digest-send-time"
              value={timeValue}
              onChange={setTimeValue}
              disabled={!digestEnabled}
            />
            <p className="text-[11px] text-text-muted leading-relaxed">
              Scroll columns pick hour, quarter-hour, and AM/PM. Matches the 15-minute platform cron. Defaults: Wednesday
              14:00 UTC.
            </p>
          </div>
          {affiliateDigestLastSentWeekKey ? (
            <p className="text-[11px] text-text-muted">
              Last automated send (week id):{' '}
              <span className="font-mono text-text-secondary">{affiliateDigestLastSentWeekKey}</span>
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={handleSaveDigest} disabled={savingDigest}>
              {savingDigest ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {savingDigest ? 'Saving…' : 'Save email settings'}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (!withCard) {
    return <div className="space-y-3">{inner}</div>;
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary mb-1">Affiliate notifications</h2>
      <p className="text-sm text-text-muted mb-4">
        Email digest for affiliate program performance.
      </p>
      {inner}
    </Card>
  );
}
