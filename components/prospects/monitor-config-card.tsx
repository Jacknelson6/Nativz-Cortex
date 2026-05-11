'use client';

// SPY-06 T23: monitor config card. Active toggle, frequency + day-of-week
// selects, Save, Run-now (rate-limit-aware), last-run status row.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Loader2, Play, Save } from 'lucide-react';
import type {
  MonitorFrequency,
  ProspectMonitorConfigRow,
} from '@/lib/prospects/types';

interface Props {
  prospectId: string;
  initialConfig: ProspectMonitorConfigRow | null;
  hasBenchmark: boolean;
}

const DAYS = [
  { v: 0, l: 'Sun' },
  { v: 1, l: 'Mon' },
  { v: 2, l: 'Tue' },
  { v: 3, l: 'Wed' },
  { v: 4, l: 'Thu' },
  { v: 5, l: 'Fri' },
  { v: 6, l: 'Sat' },
];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function MonitorConfigCard({ prospectId, initialConfig, hasBenchmark }: Props) {
  const router = useRouter();
  const [active, setActive] = useState(initialConfig?.active ?? false);
  const [frequency, setFrequency] = useState<MonitorFrequency>(
    initialConfig?.frequency ?? 'weekly',
  );
  const [dayOfWeek, setDayOfWeek] = useState<number>(initialConfig?.day_of_week ?? 1);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(
    initialConfig?.last_run_at ?? null,
  );
  const [lastError, setLastError] = useState<string | null>(
    initialConfig?.last_error ?? null,
  );

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active, frequency, day_of_week: dayOfWeek }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error ?? `HTTP ${res.status}`);
      } else {
        setMessage('Saved.');
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/monitor/run-now`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 && json.retry_after_seconds) {
          const mins = Math.ceil(json.retry_after_seconds / 60);
          setMessage(`Rate limited — try again in ${mins} min.`);
        } else {
          setMessage(json.error ?? `HTTP ${res.status}`);
        }
      } else {
        setLastRunAt(new Date().toISOString());
        setLastError(null);
        setMessage(
          `Ran: ${json.snapshotsWritten ?? 0} snapshot${(json.snapshotsWritten ?? 0) === 1 ? '' : 's'}, ${json.alertsWritten ?? 0} alert${(json.alertsWritten ?? 0) === 1 ? '' : 's'}.`,
        );
        router.refresh();
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recurring monitor</h3>
          <p className="text-xs text-text-muted">
            Re-scrape benchmark competitors weekly and alert on big shifts.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-text-muted">
          <Activity size={14} />
          {lastRunAt ? `Last run ${timeAgo(lastRunAt)}` : 'Never run'}
        </div>
      </header>

      {!hasBenchmark && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
          No competitor benchmark yet. Save monitor settings now and run the benchmark when ready — the cron will skip until competitors are picked.
        </div>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-background"
          />
          Watch competitors {frequency === 'biweekly' ? 'bi-weekly' : 'weekly'}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as MonitorFrequency)}
            disabled={!active}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
          </select>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number.parseInt(e.target.value, 10))}
            disabled={!active}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
          >
            {DAYS.map((d) => (
              <option key={d.v} value={d.v}>
                {d.l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {lastError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
          Last error: {lastError}
        </div>
      )}

      {message && (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-muted">
          {message}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save monitor
        </button>
        <button
          type="button"
          onClick={runNow}
          disabled={running || !active || !hasBenchmark}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-50"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Run now
        </button>
      </div>
    </div>
  );
}
