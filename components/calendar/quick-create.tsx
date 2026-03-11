'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Calendar, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import type { EventType } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Existing event data for edit mode */
interface EditEventData {
  /** Raw database ID (without the type prefix) */
  id: string;
  type: EventType;
  title: string;
  clientId?: string | null;
  clientName?: string | null;
  location?: string | null;
  notes?: string | null;
  duration_minutes?: number;
  recurrence_rule?: string | null;
  status?: string;
}

interface QuickCreateProps {
  date: Date;
  hour: number;
  onClose: () => void;
  onCreated: () => void;
  /** Pre-fill client and event type from scheduling banners */
  prefillClientId?: string;
  prefillClientName?: string;
  prefillType?: EventType;
  /** When set, the form is in edit mode for an existing event */
  editEvent?: EditEventData;
}

interface ClientOption {
  id: string;
  name: string;
}

const DURATION_OPTIONS = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '480', label: 'Full day' },
];

const RECURRENCE_OPTIONS = [
  { value: '', label: 'No repeat' },
  { value: 'RRULE:FREQ=WEEKLY;INTERVAL=1', label: 'Weekly' },
  { value: 'RRULE:FREQ=WEEKLY;INTERVAL=2', label: 'Biweekly' },
  { value: 'RRULE:FREQ=MONTHLY;INTERVAL=1', label: 'Monthly' },
];

const EVENT_TYPES: { type: EventType; icon: typeof Camera; label: string }[] = [
  { type: 'shoot', icon: Camera, label: 'Shoot' },
  { type: 'meeting', icon: Calendar, label: 'Meeting' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function QuickCreate({ date, hour, onClose, onCreated, prefillClientId, prefillClientName, prefillType, editEvent }: QuickCreateProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isEditing = !!editEvent;
  const [eventType, setEventType] = useState<EventType>(editEvent?.type ?? prefillType ?? 'shoot');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form fields — pre-fill from editEvent if editing
  const [title, setTitle] = useState(
    editEvent?.title ??
    (prefillType === 'shoot' && prefillClientName ? `Shoot — ${prefillClientName}` :
    prefillType === 'meeting' && prefillClientName ? `Biweekly — ${prefillClientName}` : ''),
  );
  const [clientId, setClientId] = useState(editEvent?.clientId ?? prefillClientId ?? '');
  const [location, setLocation] = useState(editEvent?.location ?? '');
  const [notes, setNotes] = useState(editEvent?.notes ?? '');
  const [duration, setDuration] = useState(
    editEvent?.duration_minutes?.toString() ?? (eventType === 'meeting' ? '30' : '120'),
  );
  const [recurrence, setRecurrence] = useState(
    editEvent?.recurrence_rule ?? (prefillType === 'meeting' ? 'RRULE:FREQ=WEEKLY;INTERVAL=2' : ''),
  );

  // Format start time
  const startHour = Math.floor(hour);
  const startMinute = Math.round((hour % 1) * 60);
  const timeStr = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Load clients
  useEffect(() => {
    fetch('/api/clients?active=true')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setClients((data.clients ?? data ?? []).map((c: Record<string, string>) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {});
  }, []);

  // Auto-fill title when client changes
  useEffect(() => {
    if (clientId && eventType === 'shoot') {
      const client = clients.find(c => c.id === clientId);
      if (client && !title) {
        setTitle(`Shoot — ${client.name}`);
      }
    }
  }, [clientId, eventType, clients, title]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay to avoid closing immediately on the click that opened it
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  async function handleDelete() {
    if (!editEvent) return;
    setDeleting(true);
    try {
      const endpoint = editEvent.type === 'meeting'
        ? `/api/meetings/${editEvent.id}`
        : `/api/shoots/${editEvent.id}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success(editEvent.type === 'meeting' ? 'Meeting cancelled' : 'Shoot deleted');
      onCreated();
      onClose();
    } catch {
      toast.error('Failed to delete event');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    setSaving(true);

    const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    try {
      if (isEditing && editEvent.type === 'meeting') {
        // PATCH existing meeting
        const scheduledAt = new Date(date);
        scheduledAt.setHours(startHour, startMinute, 0, 0);

        const res = await fetch(`/api/meetings/${editEvent.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            client_id: clientId || null,
            scheduled_at: scheduledAt.toISOString(),
            duration_minutes: parseInt(duration) || 30,
            location: location || null,
            notes: notes || null,
            recurrence_rule: recurrence || null,
          }),
        });
        if (!res.ok) throw new Error('Failed to update meeting');
        toast.success('Meeting updated');
      } else if (isEditing && editEvent.type === 'shoot') {
        // PATCH existing shoot
        const res = await fetch(`/api/shoots/${editEvent.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            client_id: clientId || null,
            shoot_date: isoDate,
            location: location || null,
            notes: notes || null,
          }),
        });
        if (!res.ok) throw new Error('Failed to update shoot');
        toast.success('Shoot updated');
      } else if (eventType === 'shoot') {
        const res = await fetch('/api/shoots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            client_ids: clientId ? [clientId] : [],
            shoot_date: isoDate,
            location: location || null,
            notes: notes || null,
          }),
        });
        if (!res.ok) throw new Error('Failed to create shoot');
        toast.success('Shoot scheduled');
      } else if (eventType === 'task') {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            client_id: clientId || null,
            due_date: isoDate,
            status: 'backlog',
            priority: 'low',
          }),
        });
        if (!res.ok) throw new Error('Failed to create task');
        toast.success('Task created');
      } else {
        // Meeting — create via meetings API with Google Calendar sync
        const scheduledAt = new Date(date);
        scheduledAt.setHours(startHour, startMinute, 0, 0);

        const res = await fetch('/api/meetings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            client_id: clientId || null,
            scheduled_at: scheduledAt.toISOString(),
            duration_minutes: parseInt(duration) || 30,
            location: location || null,
            notes: notes || null,
            recurrence_rule: recurrence || null,
            attendees: [],
          }),
        });
        if (!res.ok) throw new Error('Failed to create meeting');
        toast.success('Meeting scheduled');
      }

      onCreated();
      onClose();
    } catch {
      toast.error(isEditing ? 'Failed to update event' : 'Failed to create event');
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.15 }}
      className="fixed z-50 w-[340px] rounded-xl border border-nativz-border bg-surface shadow-elevated p-4"
      style={{
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{isEditing ? 'Edit event' : 'Quick schedule'}</h3>
          <p className="text-xs text-text-muted">{dateStr} at {timeStr}</p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-text-muted hover:bg-surface-hover transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Event type pills — locked during edit */}
      <div className="flex gap-1.5 mb-4">
        {EVENT_TYPES.map(({ type, icon: Icon, label }) => (
          <button
            key={type}
            onClick={() => {
              if (isEditing) return;
              setEventType(type);
              setTitle('');
            }}
            disabled={isEditing}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              eventType === type
                ? 'bg-accent-surface text-accent-text ring-1 ring-accent/40'
                : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
            } ${isEditing ? 'cursor-default opacity-60' : ''}`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Form */}
      <div className="space-y-3">
        <Input
          label="Title"
          id="qc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={eventType === 'shoot' ? 'Shoot — Client' : eventType === 'meeting' ? 'Meeting title' : 'Post caption'}
          autoFocus
        />

        <Select
          label="Client"
          id="qc-client"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          options={[
            { value: '', label: 'No client' },
            ...clients.map(c => ({ value: c.id, label: c.name })),
          ]}
        />

        {(eventType === 'shoot' || eventType === 'meeting') && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Location"
                id="qc-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Studio, Zoom link..."
              />
              <Select
                label="Duration"
                id="qc-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                options={DURATION_OPTIONS}
              />
            </div>
            {eventType === 'meeting' && (
              <Select
                label="Repeat"
                id="qc-recurrence"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                options={RECURRENCE_OPTIONS}
              />
            )}
            <Textarea
              label="Notes"
              id="qc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={eventType === 'shoot' ? 'Shot list, details...' : 'Agenda, discussion points...'}
              rows={2}
            />
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between mt-4 pt-3 border-t border-nativz-border">
        {isEditing ? (
          <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting || saving} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
            {deleting ? <Loader2 size={13} className="animate-spin" /> : null}
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || saving || deleting}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {saving ? (isEditing ? 'Saving...' : 'Scheduling...') : (isEditing ? 'Save changes' : 'Schedule')}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
