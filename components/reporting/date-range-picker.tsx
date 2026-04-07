'use client';

import { useState, useRef, useEffect } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DateRangePreset, DateRange } from '@/lib/types/reporting';

const presets: { value: DateRangePreset; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'last_quarter', label: '90d' },
  { value: 'ytd', label: 'YTD' },
];

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isBetween(d: Date, start: Date, end: Date): boolean {
  return d > start && d < end;
}

function formatDisplay(range: DateRange | undefined): string {
  if (!range?.start) return 'Select dates';
  const fmt = (s: string) => {
    const d = parseDate(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  if (!range.end || range.start === range.end) return fmt(range.start);
  return `${fmt(range.start)} – ${fmt(range.end)}`;
}

// ─── Calendar grid ─────────────────────────────────────────────────────────────

function CalendarMonth({
  year,
  month,
  rangeStart,
  rangeEnd,
  hoverDate,
  onDateClick,
  onDateHover,
  maxDate,
}: {
  year: number;
  month: number;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  hoverDate: Date | null;
  onDateClick: (d: Date) => void;
  onDateHover: (d: Date | null) => void;
  maxDate: Date;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Determine the effective end for highlight range (use hoverDate if still picking)
  const effectiveEnd = rangeEnd ?? hoverDate;

  return (
    <div>
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
          const isDisabled = date > maxDate;
          const isStart = rangeStart && isSameDay(date, rangeStart);
          const isEnd = effectiveEnd && rangeStart && isSameDay(date, effectiveEnd);
          const isInRange =
            rangeStart && effectiveEnd && effectiveEnd > rangeStart
              ? isBetween(date, rangeStart, effectiveEnd)
              : false;
          const isToday = isSameDay(date, new Date());
          const isSelected = isStart || isEnd;

          return (
            <button
              key={day}
              disabled={isDisabled}
              onClick={() => onDateClick(date)}
              onMouseEnter={() => onDateHover(date)}
              onMouseLeave={() => onDateHover(null)}
              className={`
                relative h-8 w-full text-xs font-medium transition-colors cursor-pointer
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

// ─── Popover ───────────────────────────────────────────────────────────────────

function CalendarPopover({
  customRange,
  onCustomRangeChange,
  onClose,
}: {
  customRange: DateRange | undefined;
  onCustomRangeChange: (range: DateRange) => void;
  onClose: () => void;
}) {
  const today = new Date();
  const maxDate = today;

  // Two months: current view and previous
  const [viewDate, setViewDate] = useState(() => {
    if (customRange?.end) {
      const d = parseDate(customRange.end);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const [rangeStart, setRangeStart] = useState<Date | null>(
    customRange?.start ? parseDate(customRange.start) : null,
  );
  const [rangeEnd, setRangeEnd] = useState<Date | null>(
    customRange?.end ? parseDate(customRange.end) : null,
  );
  const [picking, setPicking] = useState<'start' | 'end'>(
    customRange?.start && customRange?.end ? 'start' : 'start',
  );
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  const prevMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);

  function handleDateClick(d: Date) {
    if (picking === 'start') {
      setRangeStart(d);
      setRangeEnd(null);
      setPicking('end');
    } else {
      if (rangeStart && d < rangeStart) {
        // Clicked before start — restart
        setRangeStart(d);
        setRangeEnd(null);
        setPicking('end');
      } else {
        setRangeEnd(d);
        setPicking('start');
        // Commit
        if (rangeStart) {
          onCustomRangeChange({ start: toDateStr(rangeStart), end: toDateStr(d) });
        }
      }
    }
  }

  function goBack() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  }

  function goForward() {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    if (next <= new Date(today.getFullYear(), today.getMonth(), 1) || next.getMonth() === today.getMonth()) {
      setViewDate(next);
    }
  }

  // Quick presets inside the popover
  const quickRanges = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 14 days', days: 14 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
  ];

  function applyQuick(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setRangeStart(start);
    setRangeEnd(end);
    onCustomRangeChange({ start: toDateStr(start), end: toDateStr(end) });
  }

  return (
    <div className="rounded-xl border border-nativz-border bg-surface shadow-elevated p-4 w-[540px]">
      <div className="flex gap-4">
        {/* Quick ranges sidebar */}
        <div className="w-28 shrink-0 space-y-1 border-r border-nativz-border pr-3">
          {quickRanges.map((q) => (
            <button
              key={q.days}
              onClick={() => applyQuick(q.days)}
              className="w-full rounded-md px-2 py-1.5 text-left text-xs text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Calendar grids */}
        <div className="flex-1">
          {/* Navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={goBack}
              className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex gap-8 text-sm font-medium text-text-primary">
              <span>{MONTHS[prevMonth.getMonth()]} {prevMonth.getFullYear()}</span>
              <span>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
            </div>
            <button
              onClick={goForward}
              className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Two month grids */}
          <div className="grid grid-cols-2 gap-4">
            <CalendarMonth
              year={prevMonth.getFullYear()}
              month={prevMonth.getMonth()}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              hoverDate={picking === 'end' ? hoverDate : null}
              onDateClick={handleDateClick}
              onDateHover={setHoverDate}
              maxDate={maxDate}
            />
            <CalendarMonth
              year={viewDate.getFullYear()}
              month={viewDate.getMonth()}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              hoverDate={picking === 'end' ? hoverDate : null}
              onDateClick={handleDateClick}
              onDateHover={setHoverDate}
              maxDate={maxDate}
            />
          </div>

          {/* Footer hint */}
          <p className="text-[10px] text-text-muted mt-3 text-center">
            {picking === 'start' ? 'Click to set start date' : 'Click to set end date'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface DateRangePickerProps {
  value: DateRangePreset;
  onChange: (preset: DateRangePreset) => void;
  customRange?: DateRange;
  onCustomRangeChange?: (range: DateRange) => void;
}

export function DateRangePicker({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
}: DateRangePickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [popoverOpen]);

  function handlePresetChange(preset: DateRangePreset) {
    onChange(preset);
    if (preset === 'custom') {
      setPopoverOpen(true);
    } else {
      setPopoverOpen(false);
    }
  }

  return (
    <div className="relative" ref={popoverRef}>
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg bg-surface-hover/50 p-1">
          {presets.map((preset) => {
            const isActive = value === preset.value;
            return (
              <button
                key={preset.value}
                onClick={() => handlePresetChange(preset.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {value === 'custom' && (
          <button
            onClick={() => setPopoverOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm text-text-primary hover:border-accent-border/40 transition-colors cursor-pointer"
          >
            <CalendarDays size={14} className="text-text-muted" />
            <span>{formatDisplay(customRange)}</span>
          </button>
        )}
      </div>

      {/* Popover */}
      {popoverOpen && value === 'custom' && (
        <div className="absolute left-0 top-full mt-2 z-50">
          <CalendarPopover
            customRange={customRange}
            onCustomRangeChange={(range) => {
              onCustomRangeChange?.(range);
              setPopoverOpen(false);
            }}
            onClose={() => setPopoverOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
