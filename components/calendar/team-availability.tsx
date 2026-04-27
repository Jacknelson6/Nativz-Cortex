'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Loader2, Settings } from 'lucide-react';
import type { CalendarPerson, ExternalCalendarEvent } from './types';
import { HOURS } from './types';

/**
 * Team availability — DWD-only week / 4-week view.
 *
 * Pulls busy blocks for each configured `scheduling_people` row from
 * `/api/calendar/events` (Google Calendar via service account / domain-wide
 * delegation). No internal events, no tasks, no event creation. The point
 * is a glanceable read of "who is free when" before sending a client a
 * scheduling link for a kickoff call.
 *
 * People are managed at /admin/scheduling/people.
 */

const HOUR_HEIGHT_FULL = 56;
const HOUR_HEIGHT_COMPACT = 28;
const START_HOUR = HOURS[0];
const END_HOUR = HOURS[HOURS.length - 1];

type ViewMode = 'week' | '4-week';

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
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

function getRangeDates(date: Date, weeks: number): Date[] {
  const monday = getWeekStart(date);
  return Array.from({ length: weeks * 7 }, (_, i) => {
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

function formatRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${s} – ${e}`;
}

function formatTimeShort(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0
    ? `${h12} ${meridiem}`
    : `${h12}:${String(m).padStart(2, '0')} ${meridiem}`;
}

function isSameDay(iso: string, target: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === target.getFullYear() &&
    d.getMonth() === target.getMonth() &&
    d.getDate() === target.getDate()
  );
}

function getMinutesFromMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function clampToWorkingHours(min: number): number {
  return Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, min));
}

interface PeopleResponse {
  people?: Array<{
    id: string;
    displayName: string;
    color: string;
    priorityTier: 1 | 2 | 3;
    emails: string[];
    isActive: boolean;
  }>;
}

interface EventsResponse {
  calendars?: Record<
    string,
    {
      name: string;
      color: string;
      connection_type: 'team' | 'client';
      events: ExternalCalendarEvent[];
      errors?: string[];
    }
  >;
}

export function TeamAvailability() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [people, setPeople] = useState<CalendarPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date>(() => new Date());

  const weeks = viewMode === 'week' ? 1 : 4;

  const gridDates = useMemo(
    () => (viewMode === 'week' ? getWeekDates(currentDate) : getRangeDates(currentDate, weeks)),
    [currentDate, viewMode, weeks],
  );

  const weekChunks = useMemo(() => {
    const chunks: Date[][] = [];
    for (let i = 0; i < gridDates.length; i += 7) {
      chunks.push(gridDates.slice(i, i + 7));
    }
    return chunks;
  }, [gridDates]);

  const rangeStart = useMemo(() => gridDates[0], [gridDates]);
  const rangeEnd = useMemo(() => {
    const last = new Date(gridDates[gridDates.length - 1]);
    last.setDate(last.getDate() + 1);
    return last;
  }, [gridDates]);

  // Tick the now-line every minute.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const peopleRes = await fetch('/api/calendar/people');
        const peopleData: PeopleResponse = peopleRes.ok ? await peopleRes.json() : {};
        const active = (peopleData.people ?? []).filter((p) => p.isActive);

        if (active.length === 0) {
          if (!cancelled) setPeople([]);
          return;
        }

        const params = new URLSearchParams({
          person_ids: active.map((p) => p.id).join(','),
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString(),
        });

        const eventsRes = await fetch(`/api/calendar/events?${params.toString()}`);
        const eventsData: EventsResponse = eventsRes.ok ? await eventsRes.json() : {};
        const calendars = eventsData.calendars ?? {};

        const merged: CalendarPerson[] = active.map((p) => ({
          connectionId: p.id,
          name: p.displayName,
          color: p.color,
          connectionType: 'team',
          priorityTier: p.priorityTier,
          emails: p.emails,
          enabled: true,
          events: calendars[p.id]?.events ?? [],
        }));

        if (!cancelled) setPeople(merged);
      } catch {
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd]);

  function navigate(direction: 'prev' | 'next' | 'today') {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }
    const step = weeks * 7;
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + (direction === 'prev' ? -step : step));
      return next;
    });
  }

  const personSummary = useMemo(
    () =>
      people.map((p) => ({
        id: p.connectionId,
        name: p.name,
        color: p.color,
        count: p.events.filter(
          (e) => !e.isAllDay && gridDates.some((d) => isSameDay(e.start, d)),
        ).length,
      })),
    [people, gridDates],
  );

  const rangeLabel =
    viewMode === 'week'
      ? formatWeekRange(currentDate)
      : formatRange(gridDates[0], gridDates[gridDates.length - 1]);

  const todayLabel = viewMode === 'week' ? 'This week' : 'This month';
  const navStep = viewMode === 'week' ? 'week' : '4 weeks';

  return (
    <section className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-nativz-border px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold text-text-primary whitespace-nowrap">
            Team availability
          </h2>
          <span
            className="text-xs text-text-muted whitespace-nowrap tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {rangeLabel}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <div
            className="mr-2 inline-flex rounded-md border border-nativz-border bg-background overflow-hidden text-[11px]"
            role="tablist"
            aria-label="Range"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'week'}
              onClick={() => setViewMode('week')}
              className={`px-2.5 py-1 transition-colors ${
                viewMode === 'week'
                  ? 'bg-accent-text text-background font-medium'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === '4-week'}
              onClick={() => setViewMode('4-week')}
              className={`px-2.5 py-1 transition-colors ${
                viewMode === '4-week'
                  ? 'bg-accent-text text-background font-medium'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              4 weeks
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate('prev')}
            className="rounded-md p-2 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            aria-label={`Previous ${navStep}`}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => navigate('today')}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            {todayLabel}
          </button>
          <button
            type="button"
            onClick={() => navigate('next')}
            className="rounded-md p-2 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            aria-label={`Next ${navStep}`}
          >
            <ChevronRight size={16} />
          </button>
          <Link
            href="/admin/scheduling/people"
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-nativz-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            title="Manage scheduling people"
          >
            <Settings size={11} />
            Configure people
          </Link>
        </div>
      </header>

      {personSummary.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-nativz-border/60 px-4 py-2 bg-background/40">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
            {viewMode === 'week' ? 'On this week' : 'On these 4 weeks'}
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
              <span className="text-text-muted tabular-nums">{p.count}</span>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="h-[calc(100dvh-16rem)] min-h-[520px] flex items-center justify-center"
        >
          <span className="sr-only">Loading team availability…</span>
          <Loader2
            size={20}
            className="motion-safe:animate-spin text-text-muted"
            aria-hidden="true"
          />
        </div>
      ) : people.length === 0 ? (
        <EmptyState />
      ) : viewMode === 'week' ? (
        <div className="h-[calc(100dvh-16rem)] min-h-[520px] flex flex-col">
          <ScreenReaderSummary
            dates={gridDates}
            people={people}
            rangeLabel={rangeLabel}
          />
          <AvailabilityGrid
            dates={gridDates}
            people={people}
            now={now}
            hourHeight={HOUR_HEIGHT_FULL}
          />
        </div>
      ) : (
        <div className="flex flex-col">
          <ScreenReaderSummary
            dates={gridDates}
            people={people}
            rangeLabel={rangeLabel}
          />
          <div className="divide-y divide-nativz-border/60">
            {weekChunks.map((chunk, idx) => (
              <div key={idx}>
                <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted bg-background/40">
                  Week of {chunk[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <AvailabilityGrid
                  dates={chunk}
                  people={people}
                  now={now}
                  hourHeight={HOUR_HEIGHT_COMPACT}
                  noInternalScroll
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Screen-reader summary ───────────────────────────────────────────────────

interface ScreenReaderSummaryProps {
  dates: Date[];
  people: CalendarPerson[];
  rangeLabel: string;
}

function ScreenReaderSummary({ dates, people, rangeLabel }: ScreenReaderSummaryProps) {
  return (
    <div className="sr-only">
      <h3>Busy times for {rangeLabel}</h3>
      <dl>
        {dates.map((date) => {
          const dayLabel = date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          });
          const items: Array<{ name: string; start: number; end: number }> = [];
          for (const person of people) {
            for (const ev of person.events) {
              if (!isSameDay(ev.start, date) || ev.isAllDay) continue;
              const start = clampToWorkingHours(getMinutesFromMidnight(ev.start));
              const end = clampToWorkingHours(getMinutesFromMidnight(ev.end));
              if (end <= start) continue;
              items.push({ name: person.name, start, end });
            }
          }
          items.sort((a, b) => a.start - b.start);
          return (
            <div key={date.toISOString()}>
              <dt>{dayLabel}</dt>
              {items.length === 0 ? (
                <dd>Everyone is free.</dd>
              ) : (
                items.map((item, i) => (
                  <dd key={`${item.name}-${i}`}>
                    {item.name} busy {formatTimeShort(item.start)} to{' '}
                    {formatTimeShort(item.end)}
                  </dd>
                ))
              )}
            </div>
          );
        })}
      </dl>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="h-[calc(100dvh-16rem)] min-h-[520px] flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <p className="text-sm text-text-secondary max-w-sm">
        No teammates configured yet. Add who should appear on the availability
        view to start overlaying calendars.
      </p>
      <Link
        href="/admin/scheduling/people"
        className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--nz-btn-radius)] bg-accent px-3 py-1.5 text-sm font-medium text-[color:var(--accent-contrast)] shadow-[var(--shadow-card)] transition-all duration-[var(--duration-fast)] ease-out hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98]"
      >
        <Settings size={12} />
        Configure people
      </Link>
    </div>
  );
}

// ─── Grid ────────────────────────────────────────────────────────────────────

interface AvailabilityGridProps {
  dates: Date[];
  people: CalendarPerson[];
  now: Date;
  hourHeight?: number;
  noInternalScroll?: boolean;
}

function AvailabilityGrid({
  dates,
  people,
  now,
  hourHeight = HOUR_HEIGHT_FULL,
  noInternalScroll = false,
}: AvailabilityGridProps) {
  const colCount = dates.length;
  const totalHeight = (END_HOUR - START_HOUR) * hourHeight;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const isToday = (date: Date) =>
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const hourTicks = useMemo(
    () =>
      HOURS.map((hour) => ({
        hour,
        top: (hour - START_HOUR) * hourHeight,
        label: formatTimeShort(hour * 60),
      })),
    [hourHeight],
  );

  const halfHourTops = useMemo(
    () =>
      HOURS.slice(0, -1).map(
        (hour) => (hour - START_HOUR) * hourHeight + hourHeight / 2,
      ),
    [hourHeight],
  );

  // Per-day, per-person busy blocks (clamped to working hours).
  const dayBlocks = useMemo(() => {
    return dates.map((date) => {
      const blocks: Array<{
        key: string;
        person: CalendarPerson;
        startMin: number;
        endMin: number;
      }> = [];
      for (const person of people) {
        for (const ev of person.events) {
          if (!isSameDay(ev.start, date)) continue;
          if (ev.isAllDay) continue;
          const rawStart = getMinutesFromMidnight(ev.start);
          const rawEnd = getMinutesFromMidnight(ev.end);
          const startMin = clampToWorkingHours(rawStart);
          const endMin = clampToWorkingHours(rawEnd);
          if (endMin <= startMin) continue;
          blocks.push({
            key: `${person.connectionId}-${ev.id}`,
            person,
            startMin,
            endMin,
          });
        }
      }
      return { date, blocks };
    });
  }, [dates, people]);

  return (
    <div className="flex flex-1 overflow-x-auto overflow-y-hidden sm:overflow-x-hidden">
      <div className="flex flex-col flex-1 min-w-[760px] sm:min-w-0">
      {/* Day headers */}
      <div className="flex border-b border-nativz-border bg-surface">
        <div className="w-14 shrink-0" />
        <div
          className="flex-1 grid"
          style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
        >
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
                  className={`text-lg font-semibold leading-tight tabular-nums ${
                    today
                      ? 'inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-text text-background mx-auto'
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

      {/* Grid (scrollable in week mode, natural-height in 4-week mode) */}
      <div className={noInternalScroll ? '' : 'flex-1 overflow-y-auto'}>
        <div className="flex relative" style={{ height: totalHeight }}>
          {/* Hour gutter */}
          <div className="w-14 shrink-0 relative">
            {hourTicks.map(({ hour, top, label }) => (
              <div
                key={hour}
                className="absolute right-2 text-[11px] text-text-muted tabular-nums -translate-y-1/2"
                style={{ top }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div
            className="flex-1 grid relative"
            style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
          >
            {/* Hour grid lines (full width) */}
            {hourTicks.map(({ hour, top }) => (
              <div
                key={`h-${hour}`}
                className="absolute left-0 right-0 border-t border-nativz-border/30"
                style={{ top, gridColumn: '1 / -1' }}
              />
            ))}
            {halfHourTops.map((top, i) => (
              <div
                key={`hh-${i}`}
                className="absolute left-0 right-0 border-t border-nativz-border/15"
                style={{ top, gridColumn: '1 / -1' }}
              />
            ))}

            {dayBlocks.map(({ date, blocks }) => {
              const today = isToday(date);
              const slotsByPerson: Record<string, typeof blocks> = {};
              for (const b of blocks) {
                (slotsByPerson[b.person.connectionId] ??= []).push(b);
              }
              const lanes = Object.entries(slotsByPerson);
              const laneCount = Math.max(lanes.length, 1);

              return (
                <div
                  key={date.toISOString()}
                  className="relative border-l border-nativz-border/50"
                  style={{
                    height: totalHeight,
                    backgroundColor: today
                      ? 'color-mix(in srgb, var(--accent), transparent 95%)'
                      : undefined,
                  }}
                >
                  {lanes.map(([personId, lane], laneIdx) => {
                    const widthPct = 100 / laneCount;
                    const leftPct = laneIdx * widthPct;
                    return (
                      <div
                        key={personId}
                        className="absolute top-0 bottom-0"
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                        }}
                      >
                        {lane.map((b) => {
                          const top =
                            ((b.startMin - START_HOUR * 60) / 60) * hourHeight;
                          const height = Math.max(
                            ((b.endMin - b.startMin) / 60) * hourHeight,
                            10,
                          );
                          const initial = b.person.name
                            .trim()
                            .charAt(0)
                            .toUpperCase();
                          const tooltip = `${b.person.name} · ${formatTimeShort(b.startMin)}–${formatTimeShort(b.endMin)}`;
                          return (
                            <div
                              key={b.key}
                              title={tooltip}
                              className="absolute mx-0.5 rounded-sm overflow-hidden"
                              style={{
                                top,
                                height,
                                left: 0,
                                right: 0,
                                backgroundColor: `${b.person.color}40`,
                                boxShadow: `inset 0 0 0 1px ${b.person.color}80`,
                              }}
                              aria-hidden="true"
                            >
                              {height >= 40 && (
                                <span
                                  className="absolute top-1 left-1 text-[10px] font-semibold leading-none tabular-nums"
                                  style={{ color: b.person.color }}
                                >
                                  {initial}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {today &&
                    nowMinutes >= START_HOUR * 60 &&
                    nowMinutes <= END_HOUR * 60 && (
                      <div
                        role="presentation"
                        aria-hidden="true"
                        className="absolute left-0 right-0 z-20 pointer-events-none"
                        style={{
                          top:
                            ((nowMinutes - START_HOUR * 60) / 60) * hourHeight,
                        }}
                      >
                        <div className="flex items-center">
                          <div
                            className="h-2 w-2 rounded-full -ml-1"
                            style={{ backgroundColor: 'var(--nz-coral)' }}
                          />
                          <div
                            className="flex-1 h-px"
                            style={{ backgroundColor: 'var(--nz-coral)' }}
                          />
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
    </div>
  );
}
