'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarPlus,
  Check,
  Clapperboard,
  Copy,
  ExternalLink,
  Loader2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { IconCard } from '@/components/ui/icon-card';
import { isSoftBlockedTitle } from '@/lib/scheduling/soft-block-rules';
import { cn } from '@/lib/utils/cn';

interface ConfiguredPerson {
  id: string; // resolved users.id
  email: string;
  name: string;
  color: string;
  priorityTier: 1 | 2 | 3;
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
] as const;

const DURATION_PRESETS = [15, 30, 45, 60] as const;
const JAKE_EMAIL = 'jake@nativz.io';

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export function NewSchedulingEventForm({
  configuredPeople,
  linkedItem,
  prefilledClientId,
}: {
  configuredPeople: ConfiguredPerson[];
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
  const [duration, setDuration] = useState<number>(30);
  const [lookahead, setLookahead] = useState(28);
  const [workingStart, setWorkingStart] = useState('09:00');
  const [workingEnd, setWorkingEnd] = useState('17:00');
  const [timezone, setTimezone] = useState<string>('America/New_York');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [optionalUserIds, setOptionalUserIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdShareUrl, setCreatedShareUrl] = useState<string | null>(null);

  const isShoot = useMemo(() => isSoftBlockedTitle(name), [name]);
  const jakeUserId = useMemo(
    () => configuredPeople.find((p) => p.email.toLowerCase() === JAKE_EMAIL)?.id ?? null,
    [configuredPeople],
  );

  // Shoot rule: when "shoot" appears in the title and Jake is selected, mark
  // him optional automatically. Done once per shoot-true transition so a user
  // who manually flips Jake back to required isn't overridden on every render.
  const shootAppliedRef = useRef(false);
  useEffect(() => {
    if (!isShoot) {
      shootAppliedRef.current = false;
      return;
    }
    if (shootAppliedRef.current) return;
    if (!jakeUserId || !selectedUserIds.includes(jakeUserId)) return;
    setOptionalUserIds((prev) => (prev.includes(jakeUserId) ? prev : [...prev, jakeUserId]));
    shootAppliedRef.current = true;
  }, [isShoot, jakeUserId, selectedUserIds]);

  const requiredCount = selectedUserIds.filter((id) => !optionalUserIds.includes(id)).length;
  const optionalCount = selectedUserIds.length - requiredCount;

  const canSubmit = useMemo(
    () => name.trim().length >= 2 && requiredCount > 0 && !submitting,
    [name, requiredCount, submitting],
  );

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) => {
      if (prev.includes(userId)) {
        // Drop optional flag too on deselect — keeps state coherent.
        setOptionalUserIds((opt) => opt.filter((id) => id !== userId));
        return prev.filter((id) => id !== userId);
      }
      // If selecting Jake while shoot is active, default him to optional.
      if (isShoot && userId === jakeUserId) {
        setOptionalUserIds((opt) => (opt.includes(userId) ? opt : [...opt, userId]));
      }
      return [...prev, userId];
    });
  }

  function toggleOptional(userId: string) {
    setOptionalUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const members = selectedUserIds.map((userId) => {
      const person = configuredPeople.find((p) => p.id === userId);
      const isOptional = optionalUserIds.includes(userId);
      return {
        user_id: userId,
        email: person?.email ?? '',
        display_name: person?.name ?? null,
        attendance: (isOptional ? 'optional' : 'required') as 'optional' | 'required',
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
      <IconCard
        icon={<Check size={18} />}
        title="Event created"
        helpText="Anyone with this link can view your team's availability and book a time. Send it to the client."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={createdShareUrl}
              className="flex-1 rounded-md border border-nativz-border bg-background px-3 py-2 font-mono text-xs text-text-secondary"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(createdShareUrl);
                toast.success('Copied');
              }}
            >
              <Copy size={12} />
              Copy
            </Button>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-nativz-border/60 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/admin/scheduling')}
            >
              All events
            </Button>
            <a
              href={createdShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--nz-btn-radius)] bg-accent px-3 py-1.5 text-sm font-medium text-[color:var(--accent-contrast)] shadow-[var(--shadow-card)] transition-all duration-[var(--duration-fast)] ease-out hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98]"
            >
              <ExternalLink size={12} />
              Open picker
            </a>
          </div>
        </div>
      </IconCard>
    );
  }

  return (
    <div className="space-y-5">
      {linkedItem ? (
        <div className="rounded-md border border-accent-text/30 bg-accent-text/5 px-3 py-2 text-xs text-accent-text">
          Linked to onboarding item: <span className="font-medium">{linkedItem.task}</span>
          {linkedItem.client_name ? <> · {linkedItem.client_name}</> : null}
        </div>
      ) : null}

      <IconCard
        icon={<CalendarPlus size={18} />}
        title="Event"
        helpText="30-min slots on weekdays from 9 AM to 5 PM by default. Lookahead controls how far ahead the client can book."
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="event-name" className="block text-xs font-medium text-text-secondary">
              Event name
            </label>
            <input
              id="event-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kickoff with Nike"
              className="w-full rounded-md border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
            {isShoot ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
                <Clapperboard size={13} className="mt-0.5 shrink-0" />
                <div className="leading-relaxed">
                  <span className="font-medium">Shoot detected — soft blocker.</span>{' '}
                  One teammate (usually Jake) can be missing. Optional attendees don&apos;t gate availability.
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-text-secondary">Duration</label>
            <div className="grid grid-cols-4 gap-2">
              {DURATION_PRESETS.map((min) => {
                const active = duration === min;
                return (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setDuration(min)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm transition-colors',
                      active
                        ? 'border-accent bg-accent/10 text-accent-text'
                        : 'border-nativz-border text-text-secondary hover:border-text-muted/50 hover:bg-surface-hover/40',
                    )}
                    aria-pressed={active}
                  >
                    {min} min
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="lookahead" className="block text-xs font-medium text-text-secondary">
                Lookahead
              </label>
              <div className="relative">
                <input
                  id="lookahead"
                  type="number"
                  min={1}
                  max={60}
                  value={lookahead}
                  onChange={(e) =>
                    setLookahead(Math.max(1, Math.min(60, Number(e.target.value) || 28)))
                  }
                  className="w-full rounded-md border border-nativz-border bg-background px-3 py-2.5 pr-12 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-text-muted">
                  days
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="timezone" className="block text-xs font-medium text-text-secondary">
                Time zone
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-md border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-text-secondary">Working hours</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="time"
                value={workingStart}
                onChange={(e) => setWorkingStart(e.target.value)}
                className="w-full rounded-md border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                aria-label="Working start"
              />
              <input
                type="time"
                value={workingEnd}
                onChange={(e) => setWorkingEnd(e.target.value)}
                className="w-full rounded-md border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                aria-label="Working end"
              />
            </div>
          </div>
        </div>
      </IconCard>

      <IconCard
        icon={<Users size={18} />}
        title="Attendees"
        helpText="Slots only show times when every required attendee is free. Optional attendees don't gate availability. Manage who's schedulable in Scheduling → People."
        action={
          selectedUserIds.length > 0 ? (
            <span className="text-xs text-text-muted">
              {requiredCount} required
              {optionalCount > 0 ? ` · ${optionalCount} optional` : ''}
            </span>
          ) : null
        }
      >
        {configuredPeople.length === 0 ? (
          <div className="rounded-md border border-dashed border-nativz-border bg-background px-4 py-6 text-center text-xs text-text-muted">
            No scheduling people yet — add some in{' '}
            <a href="/admin/scheduling/people" className="text-accent-text hover:underline">
              Scheduling → People
            </a>{' '}
            before creating an event.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-md border border-nativz-border bg-background divide-y divide-nativz-border/50">
            {configuredPeople.map((p) => {
              const checked = selectedUserIds.includes(p.id);
              const isOptional = optionalUserIds.includes(p.id);
              return (
                <li key={p.id} className="group">
                  <div
                    className={cn(
                      'flex items-center gap-3 px-3.5 py-2.5 transition-colors',
                      checked ? 'bg-accent/[0.04]' : 'hover:bg-surface-hover/30',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleUser(p.id)}
                      className="flex flex-1 min-w-0 items-center gap-3 text-left"
                      aria-pressed={checked}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors',
                          checked
                            ? 'border-accent bg-accent text-[color:var(--accent-contrast)]'
                            : 'border-nativz-border bg-background',
                        )}
                        aria-hidden
                      >
                        {checked ? <Check size={11} strokeWidth={3} /> : null}
                      </span>
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tracking-wide text-white shadow-sm"
                        style={{ backgroundColor: p.color }}
                        aria-hidden
                      >
                        {initials(p.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {p.name}
                        </span>
                        <span className="block truncate text-xs text-text-muted">{p.email}</span>
                      </span>
                    </button>
                    {checked ? (
                      <button
                        type="button"
                        onClick={() => toggleOptional(p.id)}
                        className={cn(
                          'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wide transition-colors',
                          isOptional
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15'
                            : 'border-nativz-border text-text-muted hover:border-text-muted/60 hover:text-text-secondary',
                        )}
                        title={
                          isOptional
                            ? 'Optional — slot can book without them'
                            : 'Required — must be free'
                        }
                      >
                        {isOptional ? 'Optional' : 'Required'}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </IconCard>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={submit} disabled={!canSubmit}>
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Create event
        </Button>
      </div>
    </div>
  );
}
