'use client';

import { useMemo, useRef } from 'react';
import { Camera, Hash, CheckSquare, CalendarDays } from 'lucide-react';
import type { CalendarEvent, CalendarPerson, ExternalCalendarEvent } from './types';
import { EVENT_COLORS, EVENT_BG_COLORS, HOURS } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR = 8;
const END_HOUR = 20;
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMinutesFromMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function minutesToTop(minutes: number): number {
  return ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
}

function minutesToHeight(startMin: number, endMin: number): number {
  return Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 20);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function isSameDay(dateStr: string, targetDate: Date): boolean {
  const d = new Date(dateStr);
  return (
    d.getFullYear() === targetDate.getFullYear() &&
    d.getMonth() === targetDate.getMonth() &&
    d.getDate() === targetDate.getDate()
  );
}

/** Compute overlap columns for events (interval graph coloring). */
function computeColumns<T extends { startMin: number; endMin: number }>(
  items: T[]
): (T & { col: number; totalCols: number })[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result: (T & { col: number; totalCols: number })[] = [];
  const columns: number[] = []; // end times for each column

  for (const item of sorted) {
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      if (columns[c] <= item.startMin) {
        columns[c] = item.endMin;
        result.push({ ...item, col: c, totalCols: 0 });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push(item.endMin);
      result.push({ ...item, col: columns.length - 1, totalCols: 0 });
    }
  }

  // Assign totalCols: max columns for overlapping groups
  for (const item of result) {
    const overlapping = result.filter(
      (o) => o.startMin < item.endMin && o.endMin > item.startMin
    );
    const maxCol = Math.max(...overlapping.map((o) => o.col)) + 1;
    item.totalCols = maxCol;
  }

  return result;
}

// ─── Event type icon ──────────────────────────────────────────────────────────

function EventIcon({ type }: { type: string }) {
  const size = 11;
  switch (type) {
    case 'shoot': return <Camera size={size} />;
    case 'meeting': return <CalendarDays size={size} />;
    case 'task': return <CheckSquare size={size} />;
    default: return <Hash size={size} />;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimeGridProps {
  dates: Date[];
  events: CalendarEvent[];
  people: CalendarPerson[];
  onSlotClick: (date: Date, hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TimeGrid({ dates, events, people, onSlotClick, onEventClick }: TimeGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Today's date for the current-time indicator
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Group events by date column
  const columnData = useMemo(() => {
    return dates.map((date) => {
      // Internal events for this day
      const dayEvents = events
        .filter((e) => !e.allDay && isSameDay(e.start, date))
        .map((e) => {
          const startMin = getMinutesFromMidnight(e.start);
          const endMin = e.end ? getMinutesFromMidnight(e.end) : startMin + 60;
          return { ...e, startMin, endMin };
        });

      // All-day events
      const allDayEvents = events.filter((e) => e.allDay && isSameDay(e.start, date));

      // External calendar events for this day
      const personEvents: { person: CalendarPerson; event: ExternalCalendarEvent; startMin: number; endMin: number }[] = [];
      for (const person of people) {
        for (const evt of person.events) {
          if (isSameDay(evt.start, date)) {
            personEvents.push({
              person,
              event: evt,
              startMin: getMinutesFromMidnight(evt.start),
              endMin: getMinutesFromMidnight(evt.end),
            });
          }
        }
      }

      return { date, dayEvents: computeColumns(dayEvents), allDayEvents, personEvents };
    });
  }, [dates, events, people]);

  const isToday = (date: Date) =>
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const colCount = dates.length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* All-day row */}
      {columnData.some((c) => c.allDayEvents.length > 0) && (
        <div className="flex border-b border-nativz-border bg-surface">
          {/* Time gutter */}
          <div className="w-14 shrink-0 px-2 py-1 text-[10px] text-text-muted text-right">
            all-day
          </div>
          {/* Day columns */}
          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
            {columnData.map((col) => (
              <div
                key={col.date.toISOString()}
                className="border-l border-nativz-border/50 px-1 py-1 flex flex-wrap gap-1 min-h-[28px]"
              >
                {col.allDayEvents.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onEventClick(e)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium truncate max-w-full cursor-pointer hover:brightness-125 transition-all"
                    style={{
                      backgroundColor: EVENT_BG_COLORS[e.type],
                      color: EVENT_COLORS[e.type],
                    }}
                  >
                    <EventIcon type={e.type} /> {e.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day headers */}
      <div className="flex border-b border-nativz-border bg-surface">
        <div className="w-14 shrink-0" />
        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
          {dates.map((date) => {
            const today = isToday(date);
            return (
              <div
                key={date.toISOString()}
                className="border-l border-nativz-border/50 px-2 py-2 text-center"
              >
                <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div
                  className={`text-lg font-semibold leading-tight ${
                    today
                      ? 'inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white mx-auto'
                      : 'text-text-primary'
                  }`}
                >
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable time grid */}
      <div ref={gridRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex relative" style={{ height: TOTAL_HEIGHT }}>
          {/* Hour gutter */}
          <div className="w-14 shrink-0 relative">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 text-xs text-text-muted -translate-y-1/2"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              >
                {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div
            className="flex-1 grid relative"
            style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
          >
            {/* Hour grid lines (spans all columns) */}
            {HOURS.map((hour) => (
              <div
                key={`line-${hour}`}
                className="absolute left-0 right-0 border-t border-nativz-border/30"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT, gridColumn: `1 / -1` }}
              />
            ))}
            {/* Half-hour lines */}
            {HOURS.slice(0, -1).map((hour) => (
              <div
                key={`half-${hour}`}
                className="absolute left-0 right-0 border-t border-nativz-border/15"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2, gridColumn: `1 / -1` }}
              />
            ))}

            {/* Day columns with events */}
            {columnData.map((col, colIdx) => {
              const today = isToday(col.date);
              return (
                <div
                  key={col.date.toISOString()}
                  className={`relative border-l border-nativz-border/50 ${today ? 'bg-accent-surface/5' : ''}`}
                  style={{ height: TOTAL_HEIGHT }}
                >
                  {/* Click slots (every 30 min) */}
                  {HOURS.slice(0, -1).map((hour) => (
                    <div key={hour} className="absolute left-0 right-0" style={{ top: (hour - START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                      <button
                        onClick={() => onSlotClick(col.date, hour)}
                        className="absolute inset-x-0 top-0 h-1/2 cursor-pointer hover:bg-accent-surface/10 transition-colors"
                        aria-label={`${hour}:00`}
                      />
                      <button
                        onClick={() => onSlotClick(col.date, hour + 0.5)}
                        className="absolute inset-x-0 bottom-0 h-1/2 cursor-pointer hover:bg-accent-surface/10 transition-colors"
                        aria-label={`${hour}:30`}
                      />
                    </div>
                  ))}

                  {/* Person overlay blocks */}
                  {col.personEvents.map(({ person, event, startMin, endMin }) => (
                    <div
                      key={`person-${event.id}`}
                      className="absolute left-0 right-0 mx-0.5 rounded opacity-25 pointer-events-none"
                      style={{
                        top: minutesToTop(startMin),
                        height: minutesToHeight(startMin, endMin),
                        backgroundColor: person.color,
                      }}
                    >
                      <span className="text-[10px] text-white px-1 truncate block mt-0.5">
                        {event.title}
                      </span>
                    </div>
                  ))}

                  {/* Internal events */}
                  {col.dayEvents.map((e) => {
                    const width = `${100 / e.totalCols}%`;
                    const left = `${(e.col / e.totalCols) * 100}%`;
                    return (
                      <button
                        key={e.id}
                        onClick={() => onEventClick(e)}
                        className="absolute rounded-md px-1.5 py-1 text-left cursor-pointer hover:brightness-125 transition-all overflow-hidden border-l-2"
                        style={{
                          top: minutesToTop(e.startMin),
                          height: minutesToHeight(e.startMin, e.endMin),
                          width,
                          left,
                          backgroundColor: EVENT_BG_COLORS[e.type],
                          borderLeftColor: EVENT_COLORS[e.type],
                          color: EVENT_COLORS[e.type],
                          zIndex: 10,
                        }}
                      >
                        <div className="flex items-center gap-1 text-xs font-medium truncate">
                          <EventIcon type={e.type} />
                          <span className="truncate">{e.title}</span>
                        </div>
                        {(e.clientName || e.strategistName) && (
                          <div className="text-[10px] opacity-70 truncate">
                            {e.clientName}{e.clientName && e.strategistName ? ' · ' : ''}{e.strategistName}
                          </div>
                        )}
                        <div className="text-[10px] opacity-60">
                          {formatTime(e.start)}
                          {e.end ? ` – ${formatTime(e.end)}` : ''}
                        </div>
                      </button>
                    );
                  })}

                  {/* Current time indicator */}
                  {today && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60 && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{ top: minutesToTop(nowMinutes) }}
                    >
                      <div className="flex items-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1" />
                        <div className="flex-1 h-[2px] bg-red-500" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
