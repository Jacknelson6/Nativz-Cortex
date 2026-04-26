'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DateRangePreset, DateRange, ComparePreset } from '@/lib/types/reporting';
import { resolvePresetRange, presetLabel } from '@/lib/reporting/date-presets';

// ─── Preset sidebar ─────────────────────────────────────────────────────────

const SIDEBAR_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'yesterday',  label: 'Yesterday'    },
  { value: 'last_7d',    label: 'Last 7 days'  },
  { value: 'last_28d',   label: 'Last 28 days' },
  { value: 'last_90d',   label: 'Last 90 days' },
  { value: 'this_week',  label: 'This week'    },
  { value: 'this_month', label: 'This month'   },
  { value: 'this_year',  label: 'This year'    },
  { value: 'last_week',  label: 'Last week'    },
  { value: 'last_month', label: 'Last month'   },
  { value: 'custom',     label: 'Custom'       },
];

const COMPARE_PRESETS: { value: ComparePreset; label: string }[] = [
  { value: 'previous_period', label: 'Previous period' },
  { value: 'previous_year',   label: 'Previous year'   },
  { value: 'custom',          label: 'Custom'          },
];

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
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtShort(s: string): string {
  const d = parseDate(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(startStr: string, endStr: string): number {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function resolveCompareRange(
  primary: DateRange,
  preset: ComparePreset,
  customCompare?: DateRange,
): DateRange {
  if (preset === 'custom' && customCompare) return customCompare;
  const start = parseDate(primary.start);
  const end = parseDate(primary.end);
  if (preset === 'previous_year') {
    const s = new Date(start); s.setFullYear(s.getFullYear() - 1);
    const e = new Date(end);   e.setFullYear(e.getFullYear() - 1);
    return { start: toDateStr(s), end: toDateStr(e) };
  }
  // previous_period: same length, ending the day before primary.start
  const len = daysBetween(primary.start, primary.end);
  const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - len);
  return { start: toDateStr(prevStart), end: toDateStr(prevEnd) };
}

// ─── Calendar month ────────────────────────────────────────────────────────

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
          const isDisabled = date > maxDate;
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

// ─── Popover ────────────────────────────────────────────────────────────────

interface PopoverProps {
  initialPreset: DateRangePreset;
  initialRange: DateRange;
  initialCompareEnabled: boolean;
  initialComparePreset: ComparePreset;
  onApply: (state: {
    preset: DateRangePreset;
    range: DateRange;
    compareEnabled: boolean;
    comparePreset: ComparePreset;
    compareRange: DateRange | null;
  }) => void;
  onCancel: () => void;
}

function DateRangePopover({
  initialPreset,
  initialRange,
  initialCompareEnabled,
  initialComparePreset,
  onApply,
  onCancel,
}: PopoverProps) {
  const today = new Date();
  const maxDate = today;

  // Draft state — only committed on "Update"
  const [preset, setPreset] = useState<DateRangePreset>(initialPreset);
  const [rangeStart, setRangeStart] = useState<Date | null>(parseDate(initialRange.start));
  const [rangeEnd, setRangeEnd] = useState<Date | null>(parseDate(initialRange.end));
  const [picking, setPicking] = useState<'start' | 'end'>('start');
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [compareEnabled, setCompareEnabled] = useState(initialCompareEnabled);
  const [comparePreset, setComparePreset] = useState<ComparePreset>(initialComparePreset);

  // Right-hand calendar shows the month containing the range end (or today)
  const [viewDate, setViewDate] = useState(() => {
    const anchor = rangeEnd ?? today;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });
  const prevMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);

  // Whenever the preset changes (via sidebar), recompute the range.
  function handlePresetClick(nextPreset: DateRangePreset) {
    setPreset(nextPreset);
    if (nextPreset === 'custom') return;
    const range = resolvePresetRange(nextPreset);
    setRangeStart(parseDate(range.start));
    setRangeEnd(parseDate(range.end));
    setPicking('start');
    // Re-anchor calendar on the new range end
    const anchor = parseDate(range.end);
    setViewDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  }

  function handleDateClick(d: Date) {
    // Calendar clicks always switch to custom
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
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  }
  function goForward() {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    // Don't scroll past the current month
    const capped = new Date(today.getFullYear(), today.getMonth(), 1);
    if (next > capped) return;
    setViewDate(next);
  }

  const committedRange: DateRange | null = useMemo(() => {
    if (!rangeStart || !rangeEnd) return null;
    return { start: toDateStr(rangeStart), end: toDateStr(rangeEnd) };
  }, [rangeStart, rangeEnd]);

  const compareRange = useMemo(() => {
    if (!compareEnabled || !committedRange) return null;
    return resolveCompareRange(committedRange, comparePreset);
  }, [compareEnabled, committedRange, comparePreset]);

  const canApply = Boolean(committedRange);

  function handleUpdate() {
    if (!committedRange) return;
    onApply({
      preset,
      range: committedRange,
      compareEnabled,
      comparePreset,
      compareRange,
    });
  }

  return (
    <div className="rounded-xl border border-nativz-border bg-surface shadow-elevated w-[720px] overflow-hidden flex">
      {/* Sidebar */}
      <div className="w-44 shrink-0 border-r border-nativz-border py-3 px-2 space-y-0.5 bg-surface-hover/20">
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
              <span className={`h-3.5 w-3.5 shrink-0 rounded-full border transition-colors ${
                active ? 'border-accent bg-accent ring-[3px] ring-accent/20' : 'border-nativz-border'
              }`} />
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Calendar + compare */}
      <div className="flex-1 p-4">
        {/* Month navigation */}
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
            <span>{MONTHS[prevMonth.getMonth()]} {prevMonth.getFullYear()}</span>
            <span>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
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

        {/* Two month grids */}
        <div className="flex gap-4 mb-4">
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

        {/* Compare toggle */}
        <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={compareEnabled}
            onChange={(e) => setCompareEnabled(e.target.checked)}
            className="accent-accent h-3.5 w-3.5"
          />
          <span className="text-xs text-text-secondary">Compare</span>
        </label>

        {/* Compare preset + start/end inputs */}
        <div className="flex items-center gap-2 text-xs">
          <div className="relative">
            <select
              value={comparePreset}
              onChange={(e) => setComparePreset(e.target.value as ComparePreset)}
              disabled={!compareEnabled}
              className="appearance-none rounded-md border border-nativz-border bg-surface-hover/30 pl-3 pr-7 py-1.5 text-xs text-text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-accent-text"
            >
              {COMPARE_PRESETS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
          <span className="rounded-md border border-nativz-border bg-surface-hover/30 px-2 py-1.5 text-text-primary min-w-[112px] text-center">
            {rangeStart ? fmtShort(toDateStr(rangeStart)) : '—'}
          </span>
          <span className="text-text-muted">-</span>
          <span className="rounded-md border border-nativz-border bg-surface-hover/30 px-2 py-1.5 text-text-primary min-w-[112px] text-center">
            {rangeEnd ? fmtShort(toDateStr(rangeEnd)) : '—'}
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-nativz-border">
          <p className="text-[10px] text-text-muted">Dates are shown in your local time</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpdate}
              disabled={!canApply}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Update
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

interface DateRangePickerProps {
  value: DateRangePreset;
  onChange: (preset: DateRangePreset) => void;
  customRange?: DateRange;
  onCustomRangeChange?: (range: DateRange) => void;
  /** When true, parent is tracking a comparison range. */
  compareEnabled?: boolean;
  onCompareEnabledChange?: (enabled: boolean) => void;
  comparePreset?: ComparePreset;
  onComparePresetChange?: (preset: ComparePreset) => void;
  onCompareRangeChange?: (range: DateRange | null) => void;
}

export function DateRangePicker({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
  compareEnabled = false,
  onCompareEnabledChange,
  comparePreset = 'previous_period',
  onComparePresetChange,
  onCompareRangeChange,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Resolve the current range for display — uses the parent's stored
  // customRange when the preset is `custom`, otherwise computes from preset.
  const displayRange: DateRange = useMemo(() => {
    if (value === 'custom' && customRange) return customRange;
    return resolvePresetRange(value);
  }, [value, customRange]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleApply(state: {
    preset: DateRangePreset;
    range: DateRange;
    compareEnabled: boolean;
    comparePreset: ComparePreset;
    compareRange: DateRange | null;
  }) {
    onChange(state.preset);
    onCustomRangeChange?.(state.range);
    onCompareEnabledChange?.(state.compareEnabled);
    onComparePresetChange?.(state.comparePreset);
    onCompareRangeChange?.(state.compareRange);
    setOpen(false);
  }

  const label = presetLabel(value);
  const rangeLabel = `${fmtShort(displayRange.start)} – ${fmtShort(displayRange.end)}`;

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary hover:border-accent-border/40 transition-colors cursor-pointer"
      >
        <CalendarDays size={14} className="text-text-muted" />
        <span className="font-medium">{label}:</span>
        <span className="text-text-secondary">{rangeLabel}</span>
        <ChevronDown size={14} className="text-text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50">
          <DateRangePopover
            initialPreset={value}
            initialRange={displayRange}
            initialCompareEnabled={compareEnabled}
            initialComparePreset={comparePreset}
            onApply={handleApply}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
