'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CalendarEvent, CalendarLayer, EventType, CalendarPerson } from './types';
import { EVENT_COLORS, PERSON_COLORS } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDateRange(view: string, currentDate: Date): { start: Date; end: Date } {
  const d = new Date(currentDate);
  if (view === 'day') {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (view === 'week') {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    const start = new Date(d.getFullYear(), d.getMonth(), diff);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  if (view === 'agenda') {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    return { start, end };
  }
  // month
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

// ─── Recurrence expansion ─────────────────────────────────────────────────────

/**
 * Parse a simple RRULE and generate occurrences within the given window.
 * Supports: FREQ=WEEKLY with INTERVAL, FREQ=MONTHLY with INTERVAL.
 * This is intentionally minimal — handles the biweekly/weekly/monthly patterns
 * used in Cortex without pulling in a full RRULE library.
 */
function expandRecurrence(
  baseStart: Date,
  durationMs: number,
  rule: string,
  windowStart: Date,
  windowEnd: Date,
): { start: Date; end: Date }[] {
  const occurrences: { start: Date; end: Date }[] = [];

  // Parse RRULE fields
  const parts = rule.replace('RRULE:', '').split(';');
  const fields: Record<string, string> = {};
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k && v) fields[k] = v;
  }

  const freq = fields['FREQ'];
  const interval = parseInt(fields['INTERVAL'] ?? '1') || 1;

  if (!freq) return occurrences;

  // Generate occurrences from baseStart forward
  let current = new Date(baseStart);
  const maxOccurrences = 52; // Safety limit (1 year of weekly)
  let count = 0;

  while (current < windowEnd && count < maxOccurrences) {
    if (current >= windowStart) {
      // Skip the base occurrence (it's already in the events list)
      if (current.getTime() !== baseStart.getTime()) {
        occurrences.push({
          start: new Date(current),
          end: new Date(current.getTime() + durationMs),
        });
      }
    }

    // Advance to next occurrence
    if (freq === 'WEEKLY') {
      current = new Date(current.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
    } else if (freq === 'MONTHLY') {
      const next = new Date(current);
      next.setMonth(next.getMonth() + interval);
      current = next;
    } else {
      break; // Unsupported frequency
    }

    count++;
  }

  return occurrences;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseCalendarDataOptions {
  view: string;
  currentDate: Date;
  clientFilter: string | null;
}

interface StrategistInfo {
  name: string;
  id: string;
}

export function useCalendarData({ view, currentDate, clientFilter }: UseCalendarDataOptions) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [people, setPeople] = useState<CalendarPerson[]>([]);
  const [loading, setLoading] = useState(true);

  const VALID_LAYER_TYPES = new Set(['shoot', 'meeting', 'task']);

  function defaultLayers(): CalendarLayer[] {
    return [
      { type: 'shoot', label: 'Shoots', color: EVENT_COLORS.shoot, enabled: true, count: 0 },
      { type: 'meeting', label: 'Meetings', color: EVENT_COLORS.meeting, enabled: true, count: 0 },
      { type: 'task', label: 'Tasks', color: EVENT_COLORS.task, enabled: true, count: 0 },
    ];
  }

  // Always start with defaults to avoid hydration mismatch, then restore from localStorage
  const [layers, setLayers] = useState<CalendarLayer[]>(defaultLayers);

  // Restore layer toggle state from localStorage on mount (client only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cortex:calendar-layers');
      if (!saved) return;
      const parsed: CalendarLayer[] = JSON.parse(saved);
      // Only restore if all layers are valid (no stale 'post' entries)
      const allValid = parsed.every(l => VALID_LAYER_TYPES.has(l.type));
      if (allValid && parsed.length === defaultLayers().length) {
        setLayers(parsed);
      } else {
        // Stale cache — clear it
        localStorage.removeItem('cortex:calendar-layers');
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist layer toggles
  useEffect(() => {
    try {
      localStorage.setItem('cortex:calendar-layers', JSON.stringify(layers));
    } catch { /* ignore */ }
  }, [layers]);

  function toggleLayer(type: EventType | 'external') {
    setLayers(prev => prev.map(l => l.type === type ? { ...l, enabled: !l.enabled } : l));
  }

  function toggleAllLayers(enabled: boolean) {
    setLayers(prev => prev.map(l => ({ ...l, enabled })));
  }

  // Fetch events from multiple sources
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { start, end } = getDateRange(view, currentDate);
    const startStr = formatDateParam(start);
    const endStr = formatDateParam(end);

    const clientParam = clientFilter ? `&client_id=${clientFilter}` : '';

    try {
      // Fetch events + strategist assignments in parallel
      const [shootsRes, meetingsRes, tasksRes, strategistsRes] = await Promise.all([
        fetch(`/api/shoots?date_from=${startStr}&date_to=${endStr}${clientParam}`),
        fetch(`/api/meetings?date_from=${startStr}&date_to=${endStr}${clientParam}`),
        fetch(`/api/tasks?due_date_from=${startStr}&due_date_to=${endStr}${clientParam}`),
        fetch('/api/clients/assignments/strategists'),
      ]);

      // Build strategist lookup: clientId → strategist name
      const strategistMap = new Map<string, StrategistInfo>();
      if (strategistsRes.ok) {
        const sData = await strategistsRes.json();
        for (const entry of sData.assignments ?? []) {
          strategistMap.set(entry.client_id, { name: entry.strategist_name, id: entry.strategist_id });
        }
      }

      const allEvents: CalendarEvent[] = [];

      // Shoots → CalendarEvent
      if (shootsRes.ok) {
        const data = await shootsRes.json();
        const shoots = data.shoots ?? data ?? [];
        for (const s of shoots) {
          const cId = s.client_id ?? s.clients?.id ?? null;
          allEvents.push({
            id: `shoot-${s.id}`,
            title: s.title ?? 'Untitled shoot',
            type: 'shoot',
            start: s.shoot_date ? `${s.shoot_date}T09:00:00` : new Date().toISOString(),
            end: s.shoot_date ? `${s.shoot_date}T11:00:00` : undefined,
            clientId: cId,
            clientName: s.clients?.name ?? null,
            strategistName: cId ? (strategistMap.get(cId)?.name ?? null) : null,
            status: s.scheduled_status ?? 'scheduled',
            location: s.location ?? null,
            source: s,
          });
        }
      }

      // Meetings → CalendarEvent (+ expand recurrences)
      if (meetingsRes.ok) {
        const data = await meetingsRes.json();
        const meetings = data.meetings ?? [];
        for (const m of meetings) {
          if (m.status === 'cancelled') continue;
          const startDt = new Date(m.scheduled_at);
          const durationMs = (m.duration_minutes ?? 30) * 60 * 1000;
          const endDt = new Date(startDt.getTime() + durationMs);
          const cId = m.client_id ?? m.clients?.id ?? null;

          // Only include the base meeting if it falls within the visible date range
          // (recurring meetings may be returned by the API even if their base date is before the range)
          if (startDt >= start && startDt < end) {
            allEvents.push({
              id: `meeting-${m.id}`,
              title: m.title ?? 'Untitled meeting',
              type: 'meeting',
              start: startDt.toISOString(),
              end: endDt.toISOString(),
              clientId: cId,
              clientName: m.clients?.name ?? null,
              strategistName: cId ? (strategistMap.get(cId)?.name ?? null) : null,
              status: m.status ?? 'scheduled',
              location: m.location ?? null,
              source: m,
            });
          }

          // Expand recurrence instances within the visible date range
          if (m.recurrence_rule) {
            const instances = expandRecurrence(startDt, durationMs, m.recurrence_rule, start, end);
            for (let i = 0; i < instances.length; i++) {
              allEvents.push({
                id: `meeting-${m.id}-r${i}`,
                title: m.title ?? 'Untitled meeting',
                type: 'meeting',
                start: instances[i].start.toISOString(),
                end: instances[i].end.toISOString(),
                clientId: cId,
                clientName: m.clients?.name ?? null,
                strategistName: cId ? (strategistMap.get(cId)?.name ?? null) : null,
                status: 'scheduled',
                location: m.location ?? null,
                isRecurrenceInstance: true,
                source: m,
              });
            }
          }
        }
      }

      // Tasks → CalendarEvent
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        const tasks = data.tasks ?? data ?? [];
        for (const t of tasks) {
          const dateStr = t.due_date ?? t.shoot_date;
          if (!dateStr) continue;
          const cId = t.client_id ?? null;
          allEvents.push({
            id: `task-${t.id}`,
            title: t.title ?? 'Untitled task',
            type: 'task',
            start: `${dateStr}T00:00:00`,
            allDay: true,
            clientId: cId,
            clientName: t.clients?.name ?? null,
            strategistName: cId ? (strategistMap.get(cId)?.name ?? null) : null,
            status: t.status ?? 'backlog',
            priority: t.priority ?? 'low',
            source: t,
          });
        }
      }

      setEvents(allEvents);

      // Update layer counts
      const counts: Record<string, number> = {};
      for (const e of allEvents) counts[e.type] = (counts[e.type] ?? 0) + 1;
      setLayers(prev => prev.map(l => ({
        ...l,
        count: counts[l.type] ?? 0,
      })));
    } catch {
      // Fail silently
    } finally {
      setLoading(false);
    }
  }, [view, currentDate, clientFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Filtered events based on active layers
  const filteredEvents = useMemo(() => {
    const enabledTypes = new Set(layers.filter(l => l.enabled).map(l => l.type));
    return events.filter(e => enabledTypes.has(e.type));
  }, [events, layers]);

  // Filtered people — show all enabled people (external calendars toggled per-person in People panel)
  const filteredPeople = useMemo(() => {
    return people.filter(p => p.enabled);
  }, [people]);

  // Toggle person overlay
  function togglePerson(connectionId: string) {
    setPeople(prev => prev.map(p =>
      p.connectionId === connectionId ? { ...p, enabled: !p.enabled } : p
    ));
  }

  // Load the configured people list once on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/calendar/people')
      .then((res) => (res.ok ? res.json() : { people: [] }))
      .then((data: { people?: { id: string; displayName: string; color: string; priorityTier: 1 | 2 | 3; emails: string[] }[] }) => {
        if (cancelled) return;
        const fetched = (data.people ?? []).map((p, idx) => ({
          connectionId: p.id,
          name: p.displayName,
          color: p.color || PERSON_COLORS[idx % PERSON_COLORS.length],
          connectionType: 'team' as const,
          priorityTier: p.priorityTier,
          emails: p.emails,
          events: [],
          enabled: true,
        }));
        setPeople(fetched);
      })
      .catch(() => {
        // Soft-fail — calendar still renders internal events without people overlay
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch external calendar events for the given person ids via SA
  const fetchPeopleCalendars = useCallback(async (personIds: string[]) => {
    if (personIds.length === 0) return;
    const { start, end } = getDateRange(view, currentDate);
    try {
      const res = await fetch(
        `/api/calendar/events?person_ids=${personIds.join(',')}&start=${start.toISOString()}&end=${end.toISOString()}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const calendars = data.calendars ?? {};

      setPeople((prev) => {
        const updated = [...prev];
        for (const [personId, cal] of Object.entries(calendars) as [
          string,
          { name: string; color: string; events: { id: string; title: string; start: string; end: string; is_all_day: boolean }[] },
        ][]) {
          const existing = updated.find((p) => p.connectionId === personId);
          const events = (cal.events ?? []).map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end,
            isAllDay: e.is_all_day,
          }));
          if (existing) {
            existing.events = events;
            existing.name = cal.name ?? existing.name;
            existing.color = cal.color ?? existing.color;
          }
        }
        return updated;
      });
    } catch {
      // Partial failure OK
    }
  }, [view, currentDate]);

  // Auto-fetch events for all loaded people whenever the date/view changes
  useEffect(() => {
    const ids = people.map((p) => p.connectionId);
    if (ids.length === 0) return;
    fetchPeopleCalendars(ids);
    // We intentionally only re-run when the visible window or the loaded
    // people set changes — not on every individual toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentDate, people.length]);

  return {
    events: filteredEvents,
    allEvents: events,
    people: filteredPeople,
    allPeople: people,
    layers,
    loading,
    toggleLayer,
    toggleAllLayers,
    togglePerson,
    fetchPeopleCalendars,
    refetch: fetchEvents,
  };
}
