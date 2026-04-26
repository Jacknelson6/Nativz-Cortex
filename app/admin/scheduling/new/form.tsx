'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ConnectedUser {
  id: string;
  email: string;
  name: string | null;
}

interface LinkedItem {
  id: string;
  task: string;
  flow_id: string | null;
  client_id: string | null;
  client_name: string | null;
}

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Australia/Sydney',
  'UTC',
];

export function NewSchedulingEventForm({
  connectedUsers,
  linkedItem,
  prefilledClientId,
}: {
  connectedUsers: ConnectedUser[];
  linkedItem: LinkedItem | null;
  prefilledClientId: string | null;
}) {
  const router = useRouter();
  const defaultName = linkedItem
    ? linkedItem.client_name
      ? `${linkedItem.task} with ${linkedItem.client_name}`
      : linkedItem.task
    : '';
  const [name, setName] = useState(defaultName);
  const [duration, setDuration] = useState(30);
  const [lookahead, setLookahead] = useState(14);
  const [workingStart, setWorkingStart] = useState('09:00');
  const [workingEnd, setWorkingEnd] = useState('17:00');
  const [timezone, setTimezone] = useState('America/New_York');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdShareUrl, setCreatedShareUrl] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => name.trim().length >= 2 && selectedUserIds.length > 0 && !submitting,
    [name, selectedUserIds, submitting],
  );

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const members = selectedUserIds.map((userId) => {
      const user = connectedUsers.find((u) => u.id === userId);
      return {
        user_id: userId,
        email: user?.email ?? '',
        display_name: user?.name ?? null,
        attendance: 'required' as const,
      };
    });
    try {
      const res = await fetch('/api/scheduling/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          duration_minutes: duration,
          lookahead_days: lookahead,
          working_start: workingStart,
          working_end: workingEnd,
          timezone,
          client_id: linkedItem?.client_id ?? prefilledClientId ?? null,
          flow_id: linkedItem?.flow_id ?? null,
          item_id: linkedItem?.id ?? null,
          members,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? `Failed (${res.status})`);
        return;
      }
      const fullUrl = `${window.location.origin}${json.share_url}`;
      setCreatedShareUrl(fullUrl);
      toast.success('Event created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  if (createdShareUrl) {
    return (
      <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-center gap-2 text-emerald-300">
          <Check size={16} />
          <p className="font-medium">Event created</p>
        </div>
        <p className="text-sm text-text-secondary">
          Share this link with the client — anyone with it can view the team&apos;s availability and
          book a time.
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={createdShareUrl}
            className="flex-1 rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(createdShareUrl);
              toast.success('Copied');
            }}
            className="inline-flex items-center gap-2 rounded-md border border-nativz-border px-3 py-2 text-xs text-text-primary hover:bg-surface-hover"
          >
            <Copy size={12} />
            Copy
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.push('/admin/scheduling')}
            className="rounded-md border border-nativz-border px-3 py-2 text-xs text-text-primary hover:bg-surface-hover"
          >
            All events
          </button>
          <a
            href={createdShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-accent-text px-3 py-2 text-xs font-semibold text-background transition hover:opacity-90"
          >
            Open picker
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-2xl border border-nativz-border bg-surface p-6">
      {linkedItem ? (
        <div className="rounded-md border border-accent-text/30 bg-accent-text/5 px-3 py-2 text-xs text-accent-text">
          Linked to onboarding item: <span className="font-medium">{linkedItem.task}</span>
          {linkedItem.client_name ? <> · {linkedItem.client_name}</> : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-muted">Event name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Kickoff with Nike"
          className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm focus:border-accent-text focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted">Duration (min)</label>
          <input
            type="number"
            min={15}
            max={240}
            step={15}
            value={duration}
            onChange={(e) => setDuration(Math.max(15, Math.min(240, Number(e.target.value) || 30)))}
            className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm focus:border-accent-text focus:outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted">Lookahead (days)</label>
          <input
            type="number"
            min={1}
            max={60}
            value={lookahead}
            onChange={(e) => setLookahead(Math.max(1, Math.min(60, Number(e.target.value) || 14)))}
            className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm focus:border-accent-text focus:outline-none"
          />
        </div>
        <div className="space-y-1.5 col-span-2 sm:col-span-1">
          <label className="text-xs font-medium text-text-muted">Time zone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm focus:border-accent-text focus:outline-none"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted">Working start</label>
          <input
            type="time"
            value={workingStart}
            onChange={(e) => setWorkingStart(e.target.value)}
            className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm focus:border-accent-text focus:outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted">Working end</label>
          <input
            type="time"
            value={workingEnd}
            onChange={(e) => setWorkingEnd(e.target.value)}
            className="w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm focus:border-accent-text focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-text-muted">
          Required attendees ({selectedUserIds.length})
        </label>
        {connectedUsers.length === 0 ? (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-3 text-xs text-yellow-200">
            No internal teammates found. Add a user with a nativz.io or andersoncollaborative.com
            email before creating a scheduling event.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {connectedUsers.map((u) => {
              const checked = selectedUserIds.includes(u.id);
              const label = u.name?.trim() || u.email || u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUser(u.id)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                    checked
                      ? 'border-accent-text bg-accent-text/10 text-text-primary'
                      : 'border-nativz-border text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{label}</span>
                    {checked ? <Check size={14} className="text-accent-text shrink-0" /> : null}
                  </div>
                  <div className="truncate text-[10px] text-text-muted">{u.email}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={submitting}
          className="rounded-md border border-nativz-border px-3 py-2 text-sm text-text-primary hover:bg-surface-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-md bg-accent-text px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Create event
        </button>
      </div>
    </div>
  );
}
