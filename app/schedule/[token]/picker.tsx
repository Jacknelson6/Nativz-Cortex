'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Clock, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

interface SlotJson {
  start: string;
  end: string;
}

interface DayGroup {
  day_iso: string;
  slots: SlotJson[];
}

interface MemberRow {
  id: string;
  display_name: string;
  role_label: string | null;
  attendance: 'required' | 'optional';
}

interface MemberError {
  user_id: string;
  display_name: string;
  error: string;
}

interface FetchResponse {
  ok?: true;
  event?: {
    id: string;
    name: string;
    duration_minutes: number;
    timezone: string;
    client_name: string | null;
  };
  members?: MemberRow[];
  groups?: DayGroup[];
  member_errors?: MemberError[];
  already_picked?: boolean;
  error?: string;
}

export function SchedulePicker({
  token,
  initialName,
  initialStatus,
}: {
  token: string;
  initialName: string;
  initialStatus: string;
}) {
  const [data, setData] = useState<FetchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickingSlot, setPickingSlot] = useState<SlotJson | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const r = await fetch(`/api/schedule/${token}`);
        const json: FetchResponse = await r.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load availability');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const event = data?.event;
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const memberErrors = data?.member_errors ?? [];
  const alreadyPicked = data?.already_picked || initialStatus === 'scheduled';

  const totalSlots = useMemo(() => groups.reduce((acc, g) => acc + g.slots.length, 0), [groups]);

  async function submitPick() {
    if (!pickingSlot) return;
    if (!email.trim()) {
      toast.error('Please enter your email so the team can confirm.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/schedule/${token}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_at: pickingSlot.start,
          picked_by_email: email.trim(),
          picked_by_name: name.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? `Booking failed (${res.status})`);
        if (res.status === 409) {
          // Reload to refresh slot list.
          setData(null);
          setLoading(true);
          try {
            const refresh = await fetch(`/api/schedule/${token}`).then((r) => r.json());
            setData(refresh);
          } finally {
            setLoading(false);
            setPickingSlot(null);
          }
        }
        return;
      }
      setConfirmedAt(pickingSlot.start);
      toast.success('Time confirmed — the team will reach out.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadyPicked || confirmedAt) {
    const formatted = confirmedAt
      ? formatLocal(confirmedAt, event?.timezone ?? 'America/New_York')
      : null;
    return (
      <div className="rounded-2xl border border-nativz-border bg-surface p-8 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
          <Check size={20} />
        </div>
        <h1 className="text-xl font-semibold text-text-primary">
          {confirmedAt ? `${event?.name ?? initialName} confirmed` : 'Already booked'}
        </h1>
        <p className="text-sm text-text-secondary">
          {confirmedAt
            ? `You're set for ${formatted}. We sent a confirmation to ${email || 'your email'} — reply if anything changes.`
            : 'This time has already been booked. Reach out to the team if you need to reschedule.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-text-muted">
          {event?.client_name ?? 'Schedule'}
        </p>
        <h1 className="text-3xl font-semibold text-text-primary">{event?.name ?? initialName}</h1>
        {event ? (
          <p className="text-sm text-text-secondary leading-relaxed inline-flex items-center gap-2 flex-wrap">
            <Clock size={14} className="text-text-muted" />
            <span>{event.duration_minutes} minutes</span>
            <span className="text-text-muted">·</span>
            <span className="inline-flex items-center gap-1">
              <Users size={14} className="text-text-muted" />
              {(data?.members ?? []).map((m) => m.display_name).join(' + ')}
            </span>
            <span className="text-text-muted">·</span>
            <span>Times shown in {event.timezone}</span>
          </p>
        ) : null}
      </header>

      {memberErrors.length > 0 ? (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-200">
          Heads up — calendars for {memberErrors.map((e) => e.display_name).join(', ')} couldn&apos;t
          be checked. Times shown assume they&apos;re available; the team will confirm by email.
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-accent-text" />
          <p className="mt-3 text-sm text-text-muted">Checking the team&apos;s calendars…</p>
        </div>
      ) : groups.length === 0 || totalSlots === 0 ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center text-sm text-text-secondary">
          No overlap-free times in the next {data?.event ? '' : ''}window. Email the team and
          we&apos;ll find a time manually.
        </div>
      ) : pickingSlot ? (
        <PickConfirmation
          slot={pickingSlot}
          timezone={event?.timezone ?? 'America/New_York'}
          name={name}
          email={email}
          notes={notes}
          submitting={submitting}
          onChangeName={setName}
          onChangeEmail={setEmail}
          onChangeNotes={setNotes}
          onCancel={() => setPickingSlot(null)}
          onConfirm={submitPick}
        />
      ) : (
        <DayList
          groups={groups}
          timezone={event?.timezone ?? 'America/New_York'}
          onPick={setPickingSlot}
        />
      )}
    </div>
  );
}

function DayList({
  groups,
  timezone,
  onPick,
}: {
  groups: DayGroup[];
  timezone: string;
  onPick: (slot: SlotJson) => void;
}) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.day_iso} className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Calendar size={14} className="text-text-muted" />
            {formatDayHeader(group.day_iso, timezone)}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {group.slots.map((slot) => (
              <button
                key={slot.start}
                type="button"
                onClick={() => onPick(slot)}
                className="rounded-md border border-nativz-border bg-surface px-3 py-2 text-sm font-medium text-text-primary transition hover:border-accent-text hover:bg-accent-text/10"
              >
                {formatTime(slot.start, timezone)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PickConfirmation({
  slot,
  timezone,
  name,
  email,
  notes,
  submitting,
  onChangeName,
  onChangeEmail,
  onChangeNotes,
  onCancel,
  onConfirm,
}: {
  slot: SlotJson;
  timezone: string;
  name: string;
  email: string;
  notes: string;
  submitting: boolean;
  onChangeName: (v: string) => void;
  onChangeEmail: (v: string) => void;
  onChangeNotes: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-2xl border border-nativz-border bg-surface p-6 space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wider text-text-muted">Confirming</p>
        <p className="mt-1 text-lg font-medium text-text-primary">{formatLocal(slot.start, timezone)}</p>
      </div>
      <div className="space-y-3">
        <Field label="Your name" value={name} onChange={onChangeName} placeholder="Sam at Nike" />
        <Field
          label="Email"
          value={email}
          onChange={onChangeEmail}
          placeholder="sam@nike.com"
          type="email"
          required
        />
        <div>
          <label className="block text-xs font-medium text-text-muted">
            Anything we should know? <span className="text-text-muted/60">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => onChangeNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm focus:border-accent-text focus:outline-none"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
        >
          Pick a different time
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-accent-text px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Confirm
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'email';
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted">
        {label}
        {required ? <span className="text-red-400"> *</span> : null}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        required={required}
        className="mt-1 w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm focus:border-accent-text focus:outline-none"
      />
    </div>
  );
}

function formatDayHeader(dayIso: string, timezone: string): string {
  const [y, m, d] = dayIso.split('-').map(Number);
  // Anchor at noon UTC then re-format in tz to dodge edge-of-day rollovers.
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(anchor);
}

function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatLocal(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}
