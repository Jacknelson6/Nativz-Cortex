'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  Sun, Sofa, CalendarClock, Circle, X,
} from 'lucide-react';
import { getDateSuggestions, parseNaturalDate } from './natural-date';

// ─── Helpers ────────────────────────────────────────────────────────────

function getToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getNextWeekday(day: number): Date {
  // day: 0=Sun, 1=Mon, ...6=Sat
  const today = getToday();
  const diff = (day - today.getDay() + 7) % 7 || 7;
  return addDays(today, diff);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function shortDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const today = getToday();
  const tomorrow = addDays(today, 1);
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Calendar Grid ──────────────────────────────────────────────────────

function CalendarMonth({
  year,
  month,
  selectedDate,
  onSelect,
}: {
  year: number;
  month: number;
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const today = getToday();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sun

  const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(startDow).fill(null);

  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return (
    <div className="mb-4">
      <div className="text-sm font-semibold text-text-primary mb-2">{monthLabel}</div>
      <div className="grid grid-cols-7 gap-0">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-text-muted py-1">{d}</div>
        ))}
        {weeks.flat().map((day, i) => {
          if (day === null) return <div key={i} />;
          const d = new Date(year, month, day);
          const dateStr = toDateStr(d);
          const isToday = isSameDay(d, today);
          const isSelected = dateStr === selectedDate;
          const isPast = d < today && !isToday;

          return (
            <button
              key={i}
              onClick={() => onSelect(dateStr)}
              className={`
                relative w-full aspect-square flex items-center justify-center text-xs rounded-full cursor-pointer transition-colors
                ${isSelected ? 'bg-accent text-white font-semibold' : ''}
                ${isToday && !isSelected ? 'bg-red-500 text-white font-semibold' : ''}
                ${!isSelected && !isToday && !isPast ? 'text-text-primary hover:bg-surface-hover' : ''}
                ${isPast && !isSelected && !isToday ? 'text-text-muted/40' : ''}
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

// ─── Main Component ─────────────────────────────────────────────────────

interface DatePickerPopoverProps {
  value: string; // YYYY-MM-DD or empty
  onChange: (value: string) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  align?: 'left' | 'right' | 'center';
  /** @deprecated Input is always shown now */
  showInput?: boolean;
}

export const DatePickerPopover = forwardRef<HTMLDivElement, DatePickerPopoverProps>(function DatePickerPopover({
  value,
  onChange,
  onClose,
  anchorRef,
  align = 'left',
  showInput: _showInput = false,
}, ref) {
  const popoverRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => popoverRef.current!, []);
  const today = getToday();
  const tomorrow = addDays(today, 1);
  const thisWeekend = getNextWeekday(6); // Saturday
  const nextMonday = getNextWeekday(1);

  // Position calculation — useLayoutEffect prevents visible jump
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const popWidth = 280;
      const popHeight = 480;
      let left = rect.left;
      if (align === 'right') left = rect.right - popWidth;
      else if (align === 'center') left = rect.left + rect.width / 2 - popWidth / 2;

      left = Math.max(8, Math.min(left, window.innerWidth - popWidth - 8));

      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < popHeight && rect.top > spaceBelow
        ? rect.top - popHeight - 4
        : rect.bottom + 4;

      setPos({ top, left });
    }
  }, [anchorRef, align]);

  // Close on click outside (only when standalone with anchorRef)
  useEffect(() => {
    if (!anchorRef) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Natural language input state
  const nlInputRef = useRef<HTMLInputElement>(null);
  const [nlText, setNlText] = useState('');
  const [nlSuggestions, setNlSuggestions] = useState<ReturnType<typeof getDateSuggestions>>([]);
  const [nlSelectedIdx, setNlSelectedIdx] = useState(0);

  useEffect(() => {
    setTimeout(() => nlInputRef.current?.focus(), 50);
  }, []);

  function handleNlInput(v: string) {
    setNlText(v);
    setNlSuggestions(getDateSuggestions(v));
    setNlSelectedIdx(0);
  }

  function handleNlKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setNlSelectedIdx(i => Math.min(i + 1, nlSuggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setNlSelectedIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (nlSuggestions.length > 0) handleSelect(nlSuggestions[nlSelectedIdx].date);
      else { const p = parseNaturalDate(nlText); if (p) handleSelect(p); }
    } else if (e.key === 'Tab' && nlSuggestions.length > 0) {
      e.preventDefault();
      setNlText(nlSuggestions[nlSelectedIdx].label.toLowerCase());
      setNlSuggestions(getDateSuggestions(nlSuggestions[nlSelectedIdx].label.toLowerCase()));
    }
  }

  const shortcuts = [
    { label: 'Tomorrow', icon: Sun, hint: shortDay(tomorrow), value: toDateStr(tomorrow), color: 'text-amber-400' },
    { label: 'This weekend', icon: Sofa, hint: shortDay(thisWeekend), value: toDateStr(thisWeekend), color: 'text-blue-400' },
    { label: 'Next week', icon: CalendarClock, hint: shortDate(nextMonday), value: toDateStr(nextMonday), color: 'text-accent2-text' },
    { label: 'No date', icon: Circle, hint: '', value: '', color: 'text-text-muted' },
  ];

  function handleSelect(dateStr: string) {
    onChange(dateStr);
    onClose();
  }

  // Generate 13 months of calendars starting from current month
  const months = useMemo(() => {
    const result: { year: number; month: number }[] = [];
    let y = today.getFullYear();
    let m = today.getMonth();
    for (let i = 0; i < 13; i++) {
      result.push({ year: y, month: m });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return result;
  }, [today]);

  const style: React.CSSProperties = pos
    ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 60 }
    : anchorRef
      ? { position: 'absolute', bottom: 0, left: '100%', marginLeft: 8, zIndex: 60 }
      : {};

  return (
    <div ref={popoverRef} style={style} className="w-[280px] bg-surface/80 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
      {/* Natural language input — always visible */}
      <div className="px-3 pt-3 pb-1">
        <input
          ref={nlInputRef}
          type="text"
          value={nlText}
          onChange={(e) => handleNlInput(e.target.value)}
          onKeyDown={handleNlKeyDown}
          placeholder="Type a date, e.g. tomorrow, fri, in 3 days..."
          className="w-full bg-white/[0.06] rounded-lg px-2.5 py-1.5 text-sm text-text-primary placeholder-text-muted/50 outline-none border border-white/[0.08] focus:border-accent/40 transition-colors"
        />
        {nlSuggestions.length > 0 && nlText && (
          <div className="mt-1 rounded-lg border border-white/[0.06] bg-surface overflow-hidden">
            {nlSuggestions.map((s, i) => (
              <button
                key={s.date + s.label}
                onClick={() => handleSelect(s.date)}
                onMouseEnter={() => setNlSelectedIdx(i)}
                className={`flex items-center justify-between w-full px-2.5 py-1.5 text-sm transition-colors cursor-pointer ${
                  i === nlSelectedIdx ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <span className="text-text-primary">{s.label}</span>
                <span className="text-[10px] text-text-muted">{s.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick shortcuts */}
      <div className="px-2 py-2 space-y-0.5">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            onClick={() => handleSelect(s.value)}
            className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <s.icon size={16} className={s.color} />
            <span className="text-text-primary flex-1 text-left">{s.label}</span>
            {s.hint && <span className="text-xs text-text-muted">{s.hint}</span>}
          </button>
        ))}
      </div>

      <div className="border-t border-nativz-border" />

      {/* Calendar months — scrollable, 13 months */}
      <div className="px-4 pb-2 max-h-[320px] overflow-y-auto">
        {months.map((m) => (
          <CalendarMonth key={`${m.year}-${m.month}`} year={m.year} month={m.month} selectedDate={value} onSelect={handleSelect} />
        ))}
      </div>
    </div>
  );
});

// ─── Date Chip (used in InlineAddTask) ──────────────────────────────────

interface DateChipProps {
  value: string;
  onChange: (value: string) => void;
}

export function DateChip({ value, onChange }: DateChipProps) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      {value ? (
        <span className="inline-flex items-center gap-1 h-7 rounded-md border border-nativz-border/60 bg-surface-hover/50 px-2 text-xs text-text-secondary">
          <button ref={chipRef} onClick={() => setOpen(true)} className="flex items-center gap-1 cursor-pointer">
            <CalendarClock size={12} className="text-accent-text" />
            {formatDisplayDate(value)}
          </button>
          <button
            onClick={() => onChange('')}
            className="ml-0.5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          >
            <X size={10} />
          </button>
        </span>
      ) : (
        <button
          ref={chipRef}
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 h-7 rounded-md border border-nativz-border/60 px-2 text-xs text-text-muted hover:text-text-secondary hover:border-nativz-border transition-colors cursor-pointer"
        >
          <CalendarClock size={12} />
          Due date
        </button>
      )}

      {open && (
        <DatePickerPopover
          anchorRef={chipRef}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
