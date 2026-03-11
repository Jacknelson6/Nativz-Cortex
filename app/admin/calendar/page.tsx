'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CalendarHeader } from '@/components/calendar/calendar-header';
import { TimeGrid } from '@/components/calendar/time-grid';
import { MonthGrid } from '@/components/calendar/month-grid';
import { AgendaView } from '@/components/calendar/agenda-view';
import { PeoplePanel } from '@/components/calendar/people-panel';
import { QuickCreate } from '@/components/calendar/quick-create';
import { SchedulingBanners } from '@/components/calendar/scheduling-banners';
import { RecurrenceEditDialog } from '@/components/calendar/recurrence-edit-dialog';
import { useCalendarData } from '@/components/calendar/use-calendar-data';
import type { CalendarViewMode, CalendarEvent, EventType } from '@/components/calendar/types';
import { AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekDates(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    return dt;
  });
}

/** Next weekday from today (skip Sat/Sun) */
function nextWeekday(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EditEventData {
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

interface QuickCreateState {
  date: Date;
  hour: number;
  prefillClientId?: string;
  prefillClientName?: string;
  prefillType?: EventType;
  editEvent?: EditEventData;
}

export default function UnifiedCalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // View state from URL
  const initialView = (searchParams.get('view') as CalendarViewMode) || 'week';
  const [view, setView] = useState<CalendarViewMode>(initialView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const clientFilter = searchParams.get('client') || null;

  // Quick-create popover state
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);

  // Key to force banner re-fetch after creating from banner
  const [bannerKey, setBannerKey] = useState(0);

  // Recurrence edit dialog state
  const [recurrenceDialog, setRecurrenceDialog] = useState<CalendarEvent | null>(null);

  // Data hook
  const {
    events,
    people,
    allPeople,
    layers,
    loading,
    toggleLayer,
    toggleAllLayers,
    togglePerson,
    fetchPeopleCalendars,
    refetch,
  } = useCalendarData({ view, currentDate, clientFilter });

  // Auto-sync with Google Calendar on page load (debounced, max once per 5 minutes)
  // Uses sessionStorage so the debounce survives navigation within the same tab
  useEffect(() => {
    const SYNC_KEY = 'cortex:calendar-last-sync';
    const SYNC_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    try {
      const lastSync = parseInt(sessionStorage.getItem(SYNC_KEY) ?? '0', 10);
      if (now - lastSync < SYNC_DEBOUNCE_MS) return;
      sessionStorage.setItem(SYNC_KEY, String(now));
    } catch {
      // sessionStorage unavailable — proceed anyway
    }

    fetch('/api/calendar/sync', { method: 'POST' })
      .then((res) => {
        if (res.ok) refetch();
      })
      .catch(() => {
        // Non-critical — sync failure shouldn't block the calendar
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigation
  const navigate = useCallback(
    (direction: 'prev' | 'next' | 'today') => {
      if (direction === 'today') {
        setCurrentDate(new Date());
        return;
      }

      const d = new Date(currentDate);
      const delta = direction === 'prev' ? -1 : 1;

      if (view === 'day') {
        d.setDate(d.getDate() + delta);
      } else if (view === 'week') {
        d.setDate(d.getDate() + delta * 7);
      } else {
        d.setMonth(d.getMonth() + delta);
      }

      setCurrentDate(d);
    },
    [currentDate, view],
  );

  // View change — persist in URL
  const handleViewChange = useCallback(
    (newView: CalendarViewMode) => {
      setView(newView);
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', newView);
      router.replace(`/admin/calendar?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Slot click → open quick-create
  const handleSlotClick = useCallback((date: Date, hour: number) => {
    setQuickCreate({ date, hour });
  }, []);

  // Build edit data from a calendar event's source record
  const buildEditData = useCallback((event: CalendarEvent): EditEventData | undefined => {
    const s = event.source as Record<string, unknown> | undefined;
    if (!s) return undefined;

    if (event.type === 'shoot') {
      return {
        id: s.id as string,
        type: 'shoot',
        title: event.title,
        clientId: (s.client_id as string) ?? event.clientId ?? null,
        clientName: event.clientName ?? null,
        location: (s.location as string) ?? null,
        notes: (s.notes as string) ?? null,
      };
    }

    if (event.type === 'meeting') {
      return {
        id: s.id as string,
        type: 'meeting',
        title: event.title,
        clientId: (s.client_id as string) ?? event.clientId ?? null,
        clientName: event.clientName ?? null,
        location: (s.location as string) ?? null,
        notes: (s.notes as string) ?? null,
        duration_minutes: (s.duration_minutes as number) ?? 30,
        recurrence_rule: (s.recurrence_rule as string) ?? null,
        status: (s.status as string) ?? 'scheduled',
      };
    }

    return undefined;
  }, []);

  // Event click → show detail or recurrence dialog
  const handleEventClick = useCallback((event: CalendarEvent) => {
    // If this is a recurring meeting, show the "this event only / all future" dialog
    const source = event.source as Record<string, unknown> | undefined;
    if (event.type === 'meeting' && source?.recurrence_rule) {
      setRecurrenceDialog(event);
      return;
    }

    // For shoots and meetings: open quick-create in edit mode
    if ((event.type === 'shoot' || event.type === 'meeting') && event.source) {
      const editData = buildEditData(event);
      setQuickCreate({
        date: new Date(event.start),
        hour: new Date(event.start).getHours(),
        prefillClientId: event.clientId ?? undefined,
        prefillClientName: event.clientName ?? undefined,
        prefillType: event.type,
        editEvent: editData,
      });
    }
  }, [buildEditData]);

  // Handle recurrence edit scope choice
  const handleRecurrenceChoice = useCallback(
    (scope: 'this' | 'all') => {
      if (!recurrenceDialog) return;

      const editData = buildEditData(recurrenceDialog);

      if (scope === 'all') {
        // Edit the master meeting (all future events) — full edit with recurrence
        setQuickCreate({
          date: new Date(recurrenceDialog.start),
          hour: new Date(recurrenceDialog.start).getHours(),
          prefillClientId: recurrenceDialog.clientId ?? undefined,
          prefillClientName: recurrenceDialog.clientName ?? undefined,
          prefillType: 'meeting',
          editEvent: editData,
        });
      } else {
        // "This event only" — open quick-create for a NEW one-off meeting at this date
        // Pre-fill from the recurring meeting but don't pass editEvent (creates new)
        setQuickCreate({
          date: new Date(recurrenceDialog.start),
          hour: new Date(recurrenceDialog.start).getHours(),
          prefillClientId: recurrenceDialog.clientId ?? undefined,
          prefillClientName: recurrenceDialog.clientName ?? undefined,
          prefillType: 'meeting',
        });
      }

      setRecurrenceDialog(null);
    },
    [recurrenceDialog, buildEditData],
  );

  // Day click in month view → switch to day view
  const handleDayClick = useCallback(
    (date: Date) => {
      setCurrentDate(date);
      handleViewChange('day');
    },
    [handleViewChange],
  );

  // Banner → quick-create shoot for a specific client
  const handleBannerShoot = useCallback((clientId: string, clientName: string) => {
    const date = nextWeekday();
    setQuickCreate({
      date,
      hour: 10,
      prefillClientId: clientId,
      prefillClientName: clientName,
      prefillType: 'shoot',
    });
  }, []);

  // Banner → quick-create meeting for a specific client
  const handleBannerMeeting = useCallback((clientId: string, clientName: string) => {
    const date = nextWeekday();
    setQuickCreate({
      date,
      hour: 14,
      prefillClientId: clientId,
      prefillClientName: clientName,
      prefillType: 'meeting',
    });
  }, []);

  // After creating from quick-create — refetch events + banners
  const handleCreated = useCallback(() => {
    refetch();
    setBannerKey((k) => k + 1);
  }, [refetch]);

  // Dates for week/day time grid
  const gridDates = useMemo(() => {
    if (view === 'day') return [currentDate];
    if (view === 'week') return getWeekDates(currentDate);
    return [];
  }, [view, currentDate]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Header with nav, view toggle, layers */}
      <CalendarHeader
        currentDate={currentDate}
        view={view}
        layers={layers}
        onViewChange={handleViewChange}
        onNavigate={navigate}
        onToggleLayer={toggleLayer}
        onToggleAllLayers={toggleAllLayers}
      />

      {/* Proactive scheduling banners */}
      <SchedulingBanners
        key={bannerKey}
        onQuickCreateShoot={handleBannerShoot}
        onQuickCreateMeeting={handleBannerMeeting}
      />

      {/* Calendar body + people panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-text-muted" />
            </div>
          ) : (
            <>
              {(view === 'week' || view === 'day') && (
                <TimeGrid
                  dates={gridDates}
                  events={events}
                  people={people}
                  onSlotClick={handleSlotClick}
                  onEventClick={handleEventClick}
                />
              )}

              {view === 'month' && (
                <MonthGrid
                  currentDate={currentDate}
                  events={events}
                  onDayClick={handleDayClick}
                  onEventClick={handleEventClick}
                />
              )}

              {view === 'agenda' && (
                <AgendaView
                  events={events}
                  currentDate={currentDate}
                  onEventClick={handleEventClick}
                />
              )}
            </>
          )}
        </div>

        {/* People panel (right side) */}
        <PeoplePanel
          people={allPeople}
          onTogglePerson={togglePerson}
          onRefresh={fetchPeopleCalendars}
        />
      </div>

      {/* Quick-create popover */}
      <AnimatePresence>
        {quickCreate && (
          <QuickCreate
            date={quickCreate.date}
            hour={quickCreate.hour}
            prefillClientId={quickCreate.prefillClientId}
            prefillClientName={quickCreate.prefillClientName}
            prefillType={quickCreate.prefillType}
            editEvent={quickCreate.editEvent}
            onClose={() => setQuickCreate(null)}
            onCreated={handleCreated}
          />
        )}
      </AnimatePresence>

      {/* Recurrence edit scope dialog */}
      <AnimatePresence>
        {recurrenceDialog && (
          <RecurrenceEditDialog
            title={recurrenceDialog.title}
            onChoice={handleRecurrenceChoice}
            onClose={() => setRecurrenceDialog(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
