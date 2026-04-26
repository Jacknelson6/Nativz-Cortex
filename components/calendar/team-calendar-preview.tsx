'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { TimeGrid } from './time-grid';
import { useCalendarData } from './use-calendar-data';

/**
 * Compact week-view team calendar embed for the scheduling page.
 *
 * Reuses the full /admin/calendar data hook (internal events + SA-driven
 * Google Calendar overlays) but renders in a fixed-height frame with a
 * simpler header. The point: glance at who's free this week before
 * spinning up a new scheduling event.
 */

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function getWeekDates(date: Date): Date[] {
  const monday = getWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    return dt;
  });
}

function formatWeekRange(date: Date): string {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  if (start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}–${end.getDate()}`;
  }
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function TeamCalendarPreview() {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const { events, people, loading } = useCalendarData({
    view: 'week',
    currentDate,
    clientFilter: null,
  });

  const navigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + (direction === 'prev' ? -7 : 7));
      return next;
    });
  }, []);

  const dates = useMemo(() => getWeekDates(currentDate), [currentDate]);

  const personSummary = useMemo(() => {
    if (people.length === 0) return null;
    return people.map((p) => ({ id: p.connectionId, name: p.name, color: p.color, count: p.events.length }));
  }, [people]);

  return (
    <section className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
      {/* Compact header */}
      <header className="flex items-center justify-between gap-3 border-b border-nativz-border px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold text-text-primary whitespace-nowrap">
            Team availability
          </h2>
          <span className="text-xs text-text-muted whitespace-nowrap">
            {formatWeekRange(currentDate)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate('prev')}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => navigate('today')}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            This week
          </button>
          <button
            onClick={() => navigate('next')}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            aria-label="Next week"
          >
            <ChevronRight size={14} />
          </button>
          <Link
            href="/admin/calendar"
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-nativz-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            title="Open full calendar"
          >
            <ExternalLink size={11} />
            Open calendar
          </Link>
        </div>
      </header>

      {/* People legend */}
      {personSummary && personSummary.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-nativz-border/60 px-4 py-2 bg-background/40">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
            On this week
          </span>
          {personSummary.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] text-text-secondary"
              style={{
                backgroundColor: `${p.color}1a`,
                boxShadow: `inset 0 0 0 1px ${p.color}33`,
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
              <span className="text-text-muted">{p.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Time grid — fixed-ish height so it's truly inline */}
      <div className="h-[480px] flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : (
          <TimeGrid
            dates={dates}
            events={events}
            people={people}
            onSlotClick={() => {
              // No-op on the embed — full create flow lives on /admin/calendar
            }}
            onEventClick={() => {
              // No-op — full event editing lives on /admin/calendar
            }}
          />
        )}
      </div>
    </section>
  );
}
