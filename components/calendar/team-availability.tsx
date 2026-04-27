'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Loader2, Settings } from 'lucide-react';
import type { CalendarPerson, ExternalCalendarEvent } from './types';

/**
 * Team availability — 4-day rolling view of every teammate's busy time.
 *
 * Pulls busy blocks for each configured `scheduling_people` row from
 * `/api/calendar/events` (Google Calendar via service account / domain-wide
 * delegation, daily-cached server-side). Renders only the visible working-hour
 * window (7am–10pm) so the grid fits the viewport without internal or page
 * scrolling — overnight events get clipped at the edges, which is fine for a
 * scheduling-decision view (slot finder still has full-day data on the server).
 * When multiple people are busy at overlapping times the blocks are merged into
 * a single band labeled with everyone's initials (e.g. "C T J") so a glance
 * tells you "this slot is blocked" rather than forcing your eye to zigzag
 * between adjacent lanes.
 *
 * People are managed at /admin/scheduling/people.
 */

const DAYS_PER_PAGE = 4;
const HOUR_HEIGHT = 44;
const VISIBLE_START_HOUR = 7;
const VISIBLE_END_HOUR = 22;
const VISIBLE_HOURS = Array.from(
  { length: VISIBLE_END_HOUR - VISIBLE_START_HOUR },
  (_, i) => VISIBLE_START_HOUR + i,
);
const VISIBLE_START_MIN = VISIBLE_START_HOUR * 60;
const VISIBLE_END_MIN = VISIBLE_END_HOUR * 60;
const VISIBLE_RANGE_MIN = VISIBLE_END_MIN - VISIBLE_START_MIN;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getRangeDates(anchor: Date, days: number): Date[] {
  const start = startOfDay(anchor);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameMonth && sameYear) {
    return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}–${end.getDate()}`;
  }
  const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${s} – ${e}`;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
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

function clampToDay(min: number): number {
  return Math.max(0, Math.min(24 * 60, min));
}

/** Offset minutes-from-midnight into the visible working-hour range. */
function toVisibleOffset(min: number): number {
  return Math.max(0, Math.min(VISIBLE_RANGE_MIN, min - VISIBLE_START_MIN));
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
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

interface MergedBand {
  key: string;
  startMin: number;
  endMin: number;
  /** Persons stable-ordered by first appearance in this cluster. */
  persons: CalendarPerson[];
}

// Fetch a wide window once and paginate locally — prev/next inside the window
// is instant. We refetch only when the visible 4-day range falls outside the
// cached window (rare unless an admin scrolls weeks ahead).
const FETCH_WINDOW_DAYS_BACK = 14;
const FETCH_WINDOW_DAYS_FORWARD = 75;

export function TeamAvailability() {
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [people, setPeople] = useState<CalendarPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date>(() => new Date());
  const cachedWindowRef = useRef<{ start: Date; end: Date } | null>(null);

  const gridDates = useMemo(
    () => getRangeDates(anchor, DAYS_PER_PAGE),
    [anchor],
  );

  const visibleStart = useMemo(() => gridDates[0], [gridDates]);
  const visibleEnd = useMemo(() => {
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

    // Cache hit — visible 4-day range fits inside the wider window we already
    // fetched, so the grid can render from current `people` state without
    // hitting Google again.
    const cached = cachedWindowRef.current;
    if (
      cached &&
      visibleStart.getTime() >= cached.start.getTime() &&
      visibleEnd.getTime() <= cached.end.getTime()
    ) {
      return;
    }

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

        const fetchStart = new Date(anchor);
        fetchStart.setDate(fetchStart.getDate() - FETCH_WINDOW_DAYS_BACK);
        const fetchEnd = new Date(anchor);
        fetchEnd.setDate(fetchEnd.getDate() + FETCH_WINDOW_DAYS_FORWARD);

        const params = new URLSearchParams({
          person_ids: active.map((p) => p.id).join(','),
          start: fetchStart.toISOString(),
          end: fetchEnd.toISOString(),
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

        if (!cancelled) {
          setPeople(merged);
          cachedWindowRef.current = { start: fetchStart, end: fetchEnd };
        }
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
  }, [anchor, visibleStart, visibleEnd]);

  function navigate(direction: 'prev' | 'next' | 'today') {
    if (direction === 'today') {
      setAnchor(startOfDay(new Date()));
      return;
    }
    setAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + (direction === 'prev' ? -DAYS_PER_PAGE : DAYS_PER_PAGE));
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

  const rangeLabel = formatRange(gridDates[0], gridDates[gridDates.length - 1]);

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
          <button
            type="button"
            onClick={() => navigate('prev')}
            className="rounded-md p-2 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            aria-label="Previous 4 days"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => navigate('today')}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => navigate('next')}
            className="rounded-md p-2 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            aria-label="Next 4 days"
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
            On screen
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
          className="flex items-center justify-center py-24"
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
      ) : (
        <div>
          <ScreenReaderSummary
            dates={gridDates}
            people={people}
            rangeLabel={rangeLabel}
          />
          <AvailabilityGrid dates={gridDates} people={people} now={now} />
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
              const start = clampToDay(getMinutesFromMidnight(ev.start));
              const end = clampToDay(getMinutesFromMidnight(ev.end));
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
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p className="text-sm text-text-secondary max-w-sm">
        No teammates configured yet. Add who should appear on the availability
        view to start overlaying calendars.
      </p>
      <Link
        href="/admin/scheduling/people"
        className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--nz-btn-radius)] bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-[var(--shadow-card)] transition-all duration-[var(--duration-fast)] ease-out hover:bg-accent-hover hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98]"
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
}

/**
 * Walk a day's per-person blocks and merge any that overlap in time into
 * a single band. Each band tracks the unique set of persons whose busy
 * window contributed (preserved by first-appearance order so the legend
 * chips and band labels stay in sync).
 */
function mergeOverlapping(
  rawBlocks: Array<{ person: CalendarPerson; startMin: number; endMin: number }>,
): MergedBand[] {
  if (rawBlocks.length === 0) return [];
  const sorted = [...rawBlocks].sort((a, b) => a.startMin - b.startMin);
  const bands: MergedBand[] = [];
  let bandIdx = 0;
  for (const b of sorted) {
    const last = bands[bands.length - 1];
    if (last && b.startMin < last.endMin) {
      last.endMin = Math.max(last.endMin, b.endMin);
      if (!last.persons.some((p) => p.connectionId === b.person.connectionId)) {
        last.persons.push(b.person);
      }
    } else {
      bands.push({
        key: `band-${bandIdx++}-${b.startMin}`,
        startMin: b.startMin,
        endMin: b.endMin,
        persons: [b.person],
      });
    }
  }
  return bands;
}

function AvailabilityGrid({ dates, people, now }: AvailabilityGridProps) {
  const colCount = dates.length;
  const totalHeight = VISIBLE_RANGE_MIN / 60 * HOUR_HEIGHT;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowVisible =
    nowMinutes >= VISIBLE_START_MIN && nowMinutes <= VISIBLE_END_MIN;
  const nowOffsetMin = nowMinutes - VISIBLE_START_MIN;

  const isToday = (date: Date) =>
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const hourTicks = useMemo(
    () =>
      VISIBLE_HOURS.map((hour) => ({
        hour,
        top: (hour - VISIBLE_START_HOUR) * HOUR_HEIGHT,
        label: formatHourLabel(hour),
      })),
    [],
  );

  const halfHourTops = useMemo(
    () =>
      VISIBLE_HOURS.slice(0, -1).map(
        (hour) => (hour - VISIBLE_START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2,
      ),
    [],
  );

  const dayBands = useMemo(() => {
    return dates.map((date) => {
      const raw: Array<{ person: CalendarPerson; startMin: number; endMin: number }> = [];
      for (const person of people) {
        for (const ev of person.events) {
          if (!isSameDay(ev.start, date)) continue;
          if (ev.isAllDay) continue;
          const rawStart = clampToDay(getMinutesFromMidnight(ev.start));
          const rawEnd = clampToDay(getMinutesFromMidnight(ev.end));
          if (rawEnd <= rawStart) continue;
          // Skip events fully outside the visible window — clip the rest to
          // the visible edges so a 6am–8am block still shows as a stub at 7am.
          if (rawEnd <= VISIBLE_START_MIN) continue;
          if (rawStart >= VISIBLE_END_MIN) continue;
          raw.push({
            person,
            startMin: toVisibleOffset(rawStart),
            endMin: toVisibleOffset(rawEnd),
          });
        }
      }
      return { date, bands: mergeOverlapping(raw) };
    });
  }, [dates, people]);

  return (
    <div className="flex">
      {/* Day headers */}
      <div className="flex flex-1 flex-col">
        <div className="flex border-b border-nativz-border bg-surface">
          <div className="w-16 shrink-0" />
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

        {/* Day grid — full 24 hours, no internal scroll */}
        <div className="flex relative" style={{ height: totalHeight }}>
          {/* Hour gutter */}
          <div className="w-16 shrink-0 relative">
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
            {/* Hour grid lines */}
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

            {dayBands.map(({ date, bands }) => {
              const today = isToday(date);
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
                  {bands.map((band) => (
                    <BusyBand key={band.key} band={band} hourHeight={HOUR_HEIGHT} />
                  ))}

                  {today && nowVisible && (
                    <div
                      role="presentation"
                      aria-hidden="true"
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{ top: (nowOffsetMin / 60) * HOUR_HEIGHT }}
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
  );
}

interface BusyBandProps {
  band: MergedBand;
  hourHeight: number;
}

/**
 * A single merged busy band — full column width, with the contributing
 * person initials stacked horizontally inside. Solo bands keep their
 * person's color so quick scans stay coded; multi-person bands shift to
 * a neutral muted fill so "blocked" reads at a glance.
 */
function BusyBand({ band, hourHeight }: BusyBandProps) {
  const top = (band.startMin / 60) * hourHeight;
  const height = Math.max(((band.endMin - band.startMin) / 60) * hourHeight, 12);
  const isSolo = band.persons.length === 1;
  const tooltip = `${band.persons.map((p) => p.name).join(', ')} · ${formatTimeShort(band.startMin)}–${formatTimeShort(band.endMin)}`;

  const fill = isSolo
    ? `${band.persons[0].color}33`
    : 'color-mix(in srgb, var(--text-muted) 22%, transparent)';
  const border = isSolo
    ? `${band.persons[0].color}80`
    : 'color-mix(in srgb, var(--text-muted) 45%, transparent)';

  return (
    <div
      title={tooltip}
      className="absolute mx-1 rounded-md overflow-hidden"
      style={{
        top,
        height,
        left: 0,
        right: 0,
        backgroundColor: fill,
        boxShadow: `inset 0 0 0 1px ${border}`,
      }}
      aria-hidden="true"
    >
      {height >= 24 && (
        <div className="absolute top-1 left-1.5 right-1.5 flex items-center gap-1 flex-wrap">
          {band.persons.map((p) => (
            <span
              key={p.connectionId}
              className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-sm px-1 text-[10px] font-semibold leading-none tabular-nums"
              style={{
                backgroundColor: `${p.color}40`,
                color: p.color,
                boxShadow: `inset 0 0 0 1px ${p.color}66`,
              }}
            >
              {initial(p.name)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
