'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Generate time slots in 30-min intervals
const TIME_SLOTS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

function formatTime12(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

interface DateTimePickerProps {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM (24h) */
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
}

export function DateTimePicker({ date, time, onDateChange, onTimeChange }: DateTimePickerProps) {
  const [openPanel, setOpenPanel] = useState<'date' | 'time' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeListRef = useRef<HTMLDivElement>(null);

  // Parse current date for display
  const parsed = useMemo(() => {
    if (!date) return null;
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [date]);

  // Calendar state — which month is shown
  const [viewYear, setViewYear] = useState(() => parsed?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsed?.getMonth() ?? new Date().getMonth());

  // Sync view when date prop changes externally
  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  }, [parsed]);

  // Scroll to selected time when time panel opens
  useEffect(() => {
    if (openPanel === 'time' && timeListRef.current && time) {
      const idx = TIME_SLOTS.indexOf(time);
      if (idx >= 0) {
        const item = timeListRef.current.children[idx] as HTMLElement;
        item?.scrollIntoView({ block: 'center' });
      }
    }
  }, [openPanel, time]);

  // Close on click outside
  useEffect(() => {
    if (!openPanel) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openPanel]);

  // Close on escape
  useEffect(() => {
    if (!openPanel) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenPanel(null);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [openPanel]);

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const startOffset = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const rows = Math.ceil((startOffset + totalDays) / 7);

  const cells: { day: number; inMonth: boolean; dateStr: string }[] = [];
  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(viewYear, viewMonth, 1 - startOffset + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    cells.push({ day: d.getDate(), inMonth: d.getMonth() === viewMonth, dateStr });
  }

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const monthLabel = new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }, [viewMonth]);

  function selectDate(dateStr: string) {
    onDateChange(dateStr);
    setOpenPanel(null);
  }

  function selectToday() {
    onDateChange(todayStr);
    const d = new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setOpenPanel(null);
  }

  function clearDate() {
    onDateChange('');
    setOpenPanel(null);
  }

  function selectTime(t: string) {
    onTimeChange(t);
    setOpenPanel(null);
  }

  // Format display values
  const displayDate = parsed
    ? parsed.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : 'Pick date';

  const displayTime = time ? formatTime12(time) : 'Pick time';

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      {/* Date trigger */}
      <button
        type="button"
        onClick={() => setOpenPanel(openPanel === 'date' ? null : 'date')}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
          openPanel === 'date'
            ? 'border-accent/50 bg-surface text-text-primary'
            : 'border-nativz-border bg-surface text-text-primary hover:border-accent/50'
        }`}
      >
        <Calendar size={12} className="text-text-muted" />
        <span>{displayDate}</span>
      </button>

      {/* Time trigger */}
      <button
        type="button"
        onClick={() => setOpenPanel(openPanel === 'time' ? null : 'time')}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
          openPanel === 'time'
            ? 'border-accent/50 bg-surface text-text-primary'
            : 'border-nativz-border bg-surface text-text-primary hover:border-accent/50'
        }`}
      >
        <Clock size={12} className="text-text-muted" />
        <span>{displayTime}</span>
      </button>

      {/* Calendar dropdown */}
      {openPanel === 'date' && (
        <div className="absolute top-full left-0 z-50 mt-1 w-[280px] rounded-xl border border-nativz-border bg-surface shadow-elevated overflow-hidden animate-fade-slide-in">
          {/* Month nav */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm font-medium text-text-primary">{monthLabel}</span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1 rounded-md hover:bg-surface-hover text-text-muted cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1 rounded-md hover:bg-surface-hover text-text-muted cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 px-2">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="ui-cal-weekday py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 px-2 pb-1">
            {cells.map(({ day, inMonth, dateStr }, i) => {
              const isSelected = dateStr === date;
              const isToday = dateStr === todayStr;
              const isPast = dateStr < todayStr;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => !isPast && selectDate(dateStr)}
                  disabled={isPast}
                  className={`
                    w-full aspect-square flex items-center justify-center rounded-lg text-xs transition-colors
                    ${isPast
                      ? 'text-text-muted/25 cursor-not-allowed'
                      : 'cursor-pointer'
                    }
                    ${!inMonth && !isPast ? 'text-text-muted/40' : ''}
                    ${isSelected
                      ? 'bg-accent text-white font-medium'
                      : isToday
                        ? 'border border-accent/50 text-accent-text'
                        : isPast
                          ? ''
                          : inMonth
                            ? 'text-text-primary hover:bg-surface-hover'
                            : 'hover:bg-surface-hover/50'
                    }
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-nativz-border">
            <button
              type="button"
              onClick={clearDate}
              className="text-xs text-text-muted hover:text-text-secondary cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={selectToday}
              className="text-xs text-accent-text hover:text-accent-text/80 cursor-pointer"
            >
              Today
            </button>
          </div>
        </div>
      )}

      {/* Time dropdown */}
      {openPanel === 'time' && (
        <div className="absolute top-full right-0 z-50 mt-1 w-[140px] rounded-xl border border-nativz-border bg-surface shadow-elevated overflow-hidden animate-fade-slide-in">
          <div ref={timeListRef} className="max-h-[240px] overflow-y-auto py-1 overscroll-contain">
            {TIME_SLOTS.map((slot) => {
              const isSelected = slot === time;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => selectTime(slot)}
                  className={`w-full px-3 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-accent-surface/10 text-accent-text font-medium'
                      : 'text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  {formatTime12(slot)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
