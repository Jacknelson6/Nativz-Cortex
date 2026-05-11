'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Forward-looking date range picker for scheduling content. Mirrors the
 * visual language of the analytics `DateRangePicker` (two-month grid,
 * sidebar presets, popover trigger) but inverts the date constraint:
 * dates from today onward are selectable, past dates are disabled. No
 * compare row, no "last N days" presets — only forward presets that make
 * sense when you're scheduling.
 *
 * Used by the calendar upload dialog so the start/end inputs match the
 * rest of the product instead of falling back to the native `<input
 * type="date">` UI (which renders black icon boxes in dark mode and
 * breaks the modal's surface palette).
 */

export interface ScheduleRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtShort(s: string): string {
  const d = parseDate(s);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

type ForwardPreset =
  | 'next_7d'
  | 'next_14d'
  | 'next_30d'
  | 'rest_of_month'
  | 'next_month'
  | 'custom';

const SIDEBAR_PRESETS: { value: ForwardPreset; label: string }[] = [
  { value: 'next_7d',       label: 'Next 7 days'    },
  { value: 'next_14d',      label: 'Next 14 days'   },
  { value: 'next_30d',      label: 'Next 30 days'   },
  { value: 'rest_of_month', label: 'Rest of month'  },
  { value: 'next_month',    label: 'Next month'     },
  { value: 'custom',        label: 'Custom'         },
];

function resolvePreset(preset: ForwardPreset, today: Date): ScheduleRange | null {
  if (preset === 'custom') return null;
  if (preset === 'next_7d')  return { start: toDateStr(today), end: toDateStr(addDays(today, 6)) };
  if (preset === 'next_14d') return { start: toDateStr(today), end: toDateStr(addDays(today, 13)) };
  if (preset === 'next_30d') return { start: toDateStr(today), end: toDateStr(addDays(today, 29)) };
  if (preset === 'rest_of_month')
    return { start: toDateStr(today), end: toDateStr(endOfMonth(today)) };
  if (preset === 'next_month') {
    const start = startOfNextMonth(today);
    return { start: toDateStr(start), end: toDateStr(endOfMonth(start)) };
  }
  return null;
}

function CalendarMonth({
  year,
  month,
  rangeStart,
  rangeEnd,
  hoverDate,
  onDateClick,
  onDateHover,
  minDate,
}: {
  year: number;
  month: number;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  hoverDate: Date | null;
  onDateClick: (d: Date) => void;
  onDateHover: (d: Date | null) => void;
  minDate: Date;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const effectiveEnd = rangeEnd ?? hoverDate;

  return (
    <div className="flex-1">
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-text-muted py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const date = new Date(year, month, day);
          const isDisabled = date < minDate && !isSameDay(date, minDate);
          const isStart = rangeStart && isSameDay(date, rangeStart);
          const isEnd = effectiveEnd && rangeStart && isSameDay(date, effectiveEnd);
          const isInRange =
            rangeStart && effectiveEnd && effectiveEnd > rangeStart
              ? date > rangeStart && date < effectiveEnd
              : false;
          const isToday = isSameDay(date, new Date());
          const isSelected = isStart || isEnd;

          return (
            <button
              key={day}
              type="button"
              disabled={isDisabled}
              onClick={() => onDateClick(date)}
              onMouseEnter={() => onDateHover(date)}
              onMouseLeave={() => onDateHover(null)}
              className={`
                relative h-10 w-full text-xs font-medium transition-colors cursor-pointer
                ${isDisabled ? 'text-text-muted/30 cursor-not-allowed' : ''}
                ${isSelected ? 'bg-accent text-white z-10' : ''}
                ${isInRange && !isSelected ? 'bg-accent/15 text-accent-text' : ''}
                ${!isSelected && !isInRange && !isDisabled ? 'text-text-secondary hover:bg-surface-hover' : ''}
                ${isStart ? 'rounded-l-md' : ''}
                ${isEnd ? 'rounded-r-md' : ''}
                ${isSelected && isStart && isEnd ? 'rounded-md' : ''}
                ${isToday && !isSelected ? 'ring-1 ring-inset ring-accent/40 rounded-md' : ''}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Popover({
  initialRange,
  onApply,
  onCancel,
}: {
  initialRange: ScheduleRange;
  onApply: (next: ScheduleRange) => void;
  onCancel: () => void;
}) {
  const today = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);
  const minDate = today;

  const [preset, setPreset] = useState<ForwardPreset>('custom');
  const [rangeStart, setRangeStart] = useState<Date | null>(parseDate(initialRange.start));
  const [rangeEnd, setRangeEnd] = useState<Date | null>(parseDate(initialRange.end));
  const [picking, setPicking] = useState<'start' | 'end'>('start');
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  // Anchor the right-hand calendar on the range start (or today if unset),
  // because forward-looking schedules typically begin at "now" and extend
  // outward — anchoring on end-of-range hid the "today" cell off-screen.
  const [viewDate, setViewDate] = useState(() => {
    const anchor = rangeStart ?? today;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });
  const nextMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);

  function handlePresetClick(p: ForwardPreset) {
    setPreset(p);
    if (p === 'custom') return;
    const r = resolvePreset(p, today);
    if (!r) return;
    setRangeStart(parseDate(r.start));
    setRangeEnd(parseDate(r.end));
    setPicking('start');
    const anchor = parseDate(r.start);
    setViewDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  }

  function handleDateClick(d: Date) {
    setPreset('custom');
    if (picking === 'start') {
      setRangeStart(d);
      setRangeEnd(null);
      setPicking('end');
      return;
    }
    if (rangeStart && d < rangeStart) {
      setRangeStart(d);
      setRangeEnd(null);
      setPicking('end');
      return;
    }
    setRangeEnd(d);
    setPicking('start');
  }

  function goBack() {
    const prev = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    // Don't scroll into the past — minDate's month is the floor.
    const floor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    if (prev < floor) return;
    setViewDate(prev);
  }
  function goForward() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  }

  const committed: ScheduleRange | null = useMemo(() => {
    if (!rangeStart || !rangeEnd) return null;
    return { start: toDateStr(rangeStart), end: toDateStr(rangeEnd) };
  }, [rangeStart, rangeEnd]);

  return (
    <div className="rounded-xl border border-nativz-border bg-surface shadow-elevated w-[640px] overflow-hidden flex">
      {/* Sidebar */}
      <div className="w-40 shrink-0 border-r border-nativz-border py-3 px-2 space-y-0.5 bg-surface-hover/20">
        {SIDEBAR_PRESETS.map((p) => {
          const active = preset === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => handlePresetClick(p.value)}
              className={`flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                active
                  ? 'bg-accent/15 text-accent-text font-medium'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              <span
                className={`h-3.5 w-3.5 shrink-0 rounded-full border transition-colors ${
                  active ? 'border-accent bg-accent ring-[3px] ring-accent/20' : 'border-nativz-border'
                }`}
              />
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Calendar */}
      <div className="flex-1 p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={goBack}
            className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex gap-8 text-sm font-medium text-text-primary">
            <span>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
            <span>{MONTHS[nextMonth.getMonth()]} {nextMonth.getFullYear()}</span>
          </div>
          <button
            type="button"
            onClick={goForward}
            className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex gap-4 mb-4">
          <CalendarMonth
            year={viewDate.getFullYear()}
            month={viewDate.getMonth()}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            hoverDate={picking === 'end' ? hoverDate : null}
            onDateClick={handleDateClick}
            onDateHover={setHoverDate}
            minDate={minDate}
          />
          <CalendarMonth
            year={nextMonth.getFullYear()}
            month={nextMonth.getMonth()}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            hoverDate={picking === 'end' ? hoverDate : null}
            onDateClick={handleDateClick}
            onDateHover={setHoverDate}
            minDate={minDate}
          />
        </div>

        <div className="flex items-center gap-2 text-xs mb-3">
          <span className="rounded-md border border-nativz-border bg-surface-hover/30 px-2 py-1.5 text-text-primary min-w-[112px] text-center">
            {rangeStart ? fmtShort(toDateStr(rangeStart)) : '—'}
          </span>
          <span className="text-text-muted">to</span>
          <span className="rounded-md border border-nativz-border bg-surface-hover/30 px-2 py-1.5 text-text-primary min-w-[112px] text-center">
            {rangeEnd ? fmtShort(toDateStr(rangeEnd)) : '—'}
          </span>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-nativz-border">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => committed && onApply(committed)}
            disabled={!committed}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScheduleRangePicker({
  value,
  onChange,
  disabled,
}: {
  value: ScheduleRange;
  onChange: (next: ScheduleRange) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const label = `${fmtShort(value.start)} - ${fmtShort(value.end)}`;

  return (
    <div className="relative inline-block w-full" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex w-full items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors hover:border-accent-border/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <CalendarDays size={14} className="text-text-muted" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown size={14} className="text-text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50">
          <Popover
            initialRange={value}
            onApply={(next) => {
              onChange(next);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
