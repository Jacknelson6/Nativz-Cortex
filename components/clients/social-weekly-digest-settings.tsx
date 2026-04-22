'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, BarChart3, ChevronDown, ChevronUp, Eye, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmailPreview } from '@/components/email/email-preview';
import { TimePicker15 } from '@/components/ui/time-picker-15';
import { cn } from '@/lib/utils/cn';
import {
  AFFILIATE_DIGEST_CUSTOM_TIMEZONE,
  AFFILIATE_DIGEST_TIMEZONE_PRESETS,
} from '@/lib/affiliates/digest-timezone-presets';
import { isValidIanaTimeZone } from '@/lib/affiliates/digest-schedule';

/**
 * NAT-50 — weekly branded social digest settings. Mirrors the affiliate
 * version's shape so both configs feel the same, keyed against the
 * `social_digest_*` columns (migration 126). Emails ship through
 * /api/cron/weekly-social-report built in NAT-43.
 */

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
  const t = tz?.trim() || 'America/Los_Angeles';
  if (AFFILIATE_DIGEST_TIMEZONE_PRESETS.some((p) => p.value === t)) {
    return { preset: t, custom: '' };
  }
  return { preset: AFFILIATE_DIGEST_CUSTOM_TIMEZONE, custom: t };
}

type SocialWeeklyDigestSettingsProps = {
  clientId: string;
  socialDigestEnabled?: boolean;
  socialDigestRecipients?: string | null;
  socialDigestTimezone?: string;
  socialDigestSendDayOfWeek?: number;
  socialDigestSendHour?: number;
  socialDigestSendMinute?: number;
  socialDigestLastSentWeekKey?: string | null;
  onSaved?: () => void;
  withCard?: boolean;
};

export function SocialWeeklyDigestSettings({
  clientId,
  socialDigestEnabled = false,
  socialDigestRecipients = '',
  socialDigestTimezone = 'America/Los_Angeles',
  socialDigestSendDayOfWeek = 1,
  socialDigestSendHour = 9,
  socialDigestSendMinute = 0,
  socialDigestLastSentWeekKey = null,
  onSaved,
  withCard = true,
}: SocialWeeklyDigestSettingsProps) {
  const [digestEnabled, setDigestEnabled] = useState(socialDigestEnabled);
  const [digestRecipients, setDigestRecipients] = useState(socialDigestRecipients ?? '');
  const [timezonePreset, setTimezonePreset] = useState(
    () => timezonePresetForStored(socialDigestTimezone).preset,
  );
  const [timezoneCustom, setTimezoneCustom] = useState(
    () => timezonePresetForStored(socialDigestTimezone).custom,
  );
  const [sendDay, setSendDay] = useState(socialDigestSendDayOfWeek);
  const [timeValue, setTimeValue] = useState(
    hourMinuteToTimeValue(socialDigestSendHour, socialDigestSendMinute),
  );
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setDigestEnabled(socialDigestEnabled);
    setDigestRecipients(socialDigestRecipients ?? '');
    const { preset, custom } = timezonePresetForStored(socialDigestTimezone);
    setTimezonePreset(preset);
    setTimezoneCustom(custom);
    setSendDay(socialDigestSendDayOfWeek);
    setTimeValue(hourMinuteToTimeValue(socialDigestSendHour, socialDigestSendMinute));
  }, [
    socialDigestEnabled,
    socialDigestRecipients,
    socialDigestTimezone,
    socialDigestSendDayOfWeek,
    socialDigestSendHour,
    socialDigestSendMinute,
  ]);

  const resolvedTimezone = useMemo(() => {
    if (timezonePreset === AFFILIATE_DIGEST_CUSTOM_TIMEZONE) {
      return timezoneCustom.trim() || 'America/Los_Angeles';
    }
    return timezonePreset;
  }, [timezonePreset, timezoneCustom]);

  async function handleSave() {
    const parsed = parseTimeValue(timeValue);
    if (!parsed) {
      toast.error('Use a valid time (HH:MM, 24-hour).');
      return;
    }
    if (!isValidIanaTimeZone(resolvedTimezone)) {
      toast.error('Choose a valid IANA time zone or pick a preset.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          social_digest_email_enabled: digestEnabled,
          social_digest_recipients: digestRecipients.trim() || null,
          social_digest_timezone: resolvedTimezone,
          social_digest_send_day_of_week: sendDay,
          social_digest_send_hour: parsed.hour,
          social_digest_send_minute: parsed.minute,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error ?? 'Failed to save');
        return;
      }
      toast.success('Social email settings saved');
      onSaved?.();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const inner = (
    <div className={`${ROW_CLASS} flex-col items-stretch gap-3`}>
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-surface">
          <BarChart3 size={16} className="text-accent-text" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">Weekly social report</p>
          <p className="text-xs text-text-muted">
            Branded recap email: followers delta, top 3 posts, aggregate views + engagement, and
            upcoming shoots. Sends once per ISO week when your day and time match in the chosen
            time zone.
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
        <span className="text-sm text-text-primary">Send weekly report</span>
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
        <label htmlFor="social-digest-send-time" className="text-xs font-medium text-text-muted">
          Send time (local to time zone)
        </label>
        <TimePicker15
          id="social-digest-send-time"
          value={timeValue}
          onChange={setTimeValue}
          disabled={!digestEnabled}
        />
        <p className="text-xs text-text-muted leading-relaxed">
          Scroll columns pick hour, quarter-hour, and AM/PM. Defaults: Monday 09:00
          America/Los_Angeles.
        </p>
      </div>
      {socialDigestLastSentWeekKey ? (
        <p className="text-xs text-text-muted">
          Last automated send (week id):{' '}
          <span className="font-mono text-text-secondary">{socialDigestLastSentWeekKey}</span>
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setPreviewOpen((v) => !v)}
        >
          {previewOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <Eye size={14} />
          {previewOpen ? 'Hide preview' : 'Preview this week\u2019s email'}
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save email settings'}
        </Button>
      </div>

      {previewOpen && (
        <div className="pt-2">
          <EmailPreview input={{ kind: 'weekly_social', clientId }} />
        </div>
      )}
    </div>
  );

  if (!withCard) {
    return <div className="space-y-3">{inner}</div>;
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary mb-1">Social notifications</h2>
      <p className="text-sm text-text-muted mb-4">
        Branded weekly recap email — follower delta, top posts, engagement totals.
      </p>
      {inner}
    </Card>
  );
}
