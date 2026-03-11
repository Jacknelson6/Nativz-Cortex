'use client';

import { useMemo } from 'react';
import { Camera, CalendarDays, CheckSquare, Hash, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { CalendarEvent } from './types';
import { EVENT_COLORS } from './types';

interface AgendaViewProps {
  events: CalendarEvent[];
  currentDate: Date;
  onEventClick: (event: CalendarEvent) => void;
}

function EventIcon({ type }: { type: string }) {
  const size = 14;
  switch (type) {
    case 'shoot': return <Camera size={size} />;
    case 'meeting': return <CalendarDays size={size} />;
    case 'task': return <CheckSquare size={size} />;
    default: return <Hash size={size} />;
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case 'shoot': return 'Shoot';
    case 'post': return 'Post';
    case 'task': return 'Task';
    case 'meeting': return 'Meeting';
    default: return type;
  }
}

export function AgendaView({ events, currentDate, onEventClick }: AgendaViewProps) {
  const today = new Date();

  // Group events by date, then sort within each day
  const grouped = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};

    for (const e of events) {
      const d = new Date(e.start);
      const key = d.toISOString().split('T')[0];
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }

    // Sort keys, then sort events within each day
    const sortedKeys = Object.keys(map).sort();
    return sortedKeys.map((key) => ({
      dateStr: key,
      date: new Date(key + 'T00:00:00'),
      events: map[key].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    }));
  }, [events]);

  const isToday = (date: Date) =>
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (grouped.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted py-20">
        No events in this period
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {grouped.map(({ dateStr, date, events: dayEvents }) => (
        <div key={dateStr}>
          {/* Day header */}
          <div className={`sticky top-0 z-10 px-4 py-2 border-b border-nativz-border ${isToday(date) ? 'bg-accent-surface/10' : 'bg-surface'}`}>
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
              {date.toLocaleDateString('en-US', { weekday: 'long' })}
            </span>
            <span className={`ml-2 text-sm font-semibold ${isToday(date) ? 'text-accent-text' : 'text-text-primary'}`}>
              {date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              {isToday(date) && <span className="ml-1.5 text-xs font-normal text-accent-text">Today</span>}
            </span>
          </div>

          {/* Events list */}
          <div className="divide-y divide-nativz-border/50">
            {dayEvents.map((e) => (
              <button
                key={e.id}
                onClick={() => onEventClick(e)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors cursor-pointer"
              >
                {/* Time + color bar */}
                <div className="w-16 shrink-0 text-right">
                  {e.allDay ? (
                    <span className="text-[10px] font-medium text-text-muted uppercase">All day</span>
                  ) : (
                    <span className="text-xs text-text-secondary">
                      {new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                <div
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: EVENT_COLORS[e.type] }}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ color: EVENT_COLORS[e.type] }}>
                      <EventIcon type={e.type} />
                    </span>
                    <span className="text-sm font-medium text-text-primary truncate">{e.title}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {e.clientName && (
                      <span className="text-xs text-text-muted">{e.clientName}</span>
                    )}
                    {e.strategistName && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-hover text-text-secondary">{e.strategistName}</span>
                    )}
                    {e.location && (
                      <span className="flex items-center gap-0.5 text-xs text-text-muted">
                        <MapPin size={10} /> {e.location}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                {e.status && (
                  <Badge
                    variant={
                      e.status === 'completed' || e.status === 'done' || e.status === 'published' ? 'success'
                      : e.status === 'scheduled' ? 'info'
                      : e.status === 'cancelled' ? 'danger'
                      : 'default'
                    }
                    className="shrink-0"
                  >
                    {e.status.replace('_', ' ')}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
