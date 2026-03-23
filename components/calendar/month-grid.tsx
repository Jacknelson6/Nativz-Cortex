'use client';

import { useMemo } from 'react';
import { Camera, CalendarDays, CheckSquare, Hash } from 'lucide-react';
import type { CalendarEvent } from './types';
import { EVENT_COLORS, EVENT_BG_COLORS } from './types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface MonthGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

function EventIcon({ type }: { type: string }) {
  const size = 10;
  switch (type) {
    case 'shoot': return <Camera size={size} />;
    case 'meeting': return <CalendarDays size={size} />;
    case 'task': return <CheckSquare size={size} />;
    default: return <Hash size={size} />;
  }
}

export function MonthGrid({ currentDate, events, onDayClick, onEventClick }: MonthGridProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay(); // Sunday = 0
    const totalDays = lastDay.getDate();
    const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

    const result: { date: Date; dateStr: string; inMonth: boolean }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const date = new Date(year, month, 1 - startOffset + i);
      const dateStr = date.toISOString().split('T')[0];
      result.push({ date, dateStr, inMonth: date.getMonth() === month });
    }
    return result;
  }, [year, month]);

  // Group events by date string
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of events) {
      const d = new Date(e.start);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    return map;
  }, [events]);

  const isToday = (date: Date) =>
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-nativz-border">
        {WEEKDAYS.map((day) => (
          <div key={day} className="ui-cal-weekday uppercase px-2 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {cells.map(({ date, dateStr, inMonth }) => {
          const dayEvents = eventsByDate[dateStr] ?? [];
          const todayCell = isToday(date);

          return (
            <div
              key={dateStr}
              onClick={() => onDayClick(date)}
              className={`
                min-h-[90px] border-b border-r border-nativz-border/50 p-1 cursor-pointer transition-colors
                ${inMonth ? 'hover:bg-surface-hover/50' : 'opacity-30'}
                ${todayCell ? 'bg-accent-surface/5' : ''}
              `}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className={`text-xs font-medium leading-none ${
                    todayCell
                      ? 'flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white'
                      : 'text-text-secondary px-0.5'
                  }`}
                >
                  {date.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-text-muted sm:hidden">
                    {dayEvents.length}
                  </span>
                )}
              </div>

              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEventClick(e);
                    }}
                    className="w-full text-left group"
                  >
                    <div
                      className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight truncate transition-all hover:brightness-125"
                      style={{
                        backgroundColor: EVENT_BG_COLORS[e.type],
                        color: EVENT_COLORS[e.type],
                        borderLeft: `2px solid ${EVENT_COLORS[e.type]}`,
                      }}
                    >
                      <EventIcon type={e.type} />
                      <span className="truncate">{e.title}</span>
                    </div>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-text-muted px-1">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
