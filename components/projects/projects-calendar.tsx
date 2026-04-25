'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Camera, Scissors, CheckSquare } from 'lucide-react';
import { type Project, normalizeProjectType } from './types';

interface ProjectsCalendarProps {
  projects: Project[];
  onSelect: (id: string) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Tinted toward the Nativz palette: cyan = brand/shoot, fuchsia = post-production
// edit, coral = paid-media urgency. Task/content/strategy take calmer
// non-brand tints so the brand colors keep their meaning.
const TYPE_COLOR = {
  shoot: 'bg-[#00AEEF]/80 text-white',
  edit: 'bg-[#EC4899]/75 text-white',
  task: 'bg-emerald-500/70 text-white',
  content: 'bg-amber-500/75 text-white',
  paid_media: 'bg-[#ED6B63]/75 text-white',
  strategy: 'bg-indigo-400/75 text-white',
} as const;

const TYPE_ICON = {
  shoot: Camera, edit: Scissors, task: CheckSquare,
  content: CheckSquare, paid_media: CheckSquare, strategy: CheckSquare,
} as const;

/** Returns the calendar date a project should plot on, given its type. */
function projectDate(p: Project): string | null {
  const type = normalizeProjectType(p.task_type);
  if (type === 'shoot' && p.shoot_start_at) return p.shoot_start_at.slice(0, 10);
  if (type === 'edit' && p.edit_due_at) return p.edit_due_at.slice(0, 10);
  return p.due_date ?? null;
}

function fmtDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function ProjectsCalendar({ projects, onSelect }: ProjectsCalendarProps) {
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const todayStr = useMemo(() => {
    const t = new Date();
    return fmtDate(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const grid: { date: string; day: number; isCurrentMonth: boolean }[] = [];

    const prevMonthLast = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthLast - i;
      grid.push({ date: fmtDate(year, month - 1, d), day: d, isCurrentMonth: false });
    }
    for (let d = 1; d <= totalDays; d++) {
      grid.push({ date: fmtDate(year, month, d), day: d, isCurrentMonth: true });
    }
    while (grid.length % 7 !== 0) {
      const d = grid.length - startOffset - totalDays + 1;
      grid.push({ date: fmtDate(year, month + 1, d), day: d, isCurrentMonth: false });
    }
    return grid;
  }, [year, month]);

  const byDate = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of projects) {
      const date = projectDate(p);
      if (!date) continue;
      const arr = map.get(date) ?? [];
      arr.push(p);
      map.set(date, arr);
    }
    return map;
  }, [projects]);

  return (
    <div className="rounded-lg border border-nativz-border bg-surface">
      <header className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">
          {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label="Previous month"
            className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label="Next month"
            className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 border-b border-nativz-border">
        {DAY_NAMES.map((d) => (
          <div key={d} className="px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const items = byDate.get(d.date) ?? [];
          const isToday = d.date === todayStr;
          return (
            <div
              key={`${d.date}-${i}`}
              className={`min-h-[96px] border-b border-r border-nativz-border p-1.5 ${
                d.isCurrentMonth ? 'bg-surface' : 'bg-surface/40 text-text-tertiary'
              } ${isToday ? 'ring-1 ring-inset ring-accent-text/40' : ''}`}
            >
              <div className={`text-xs ${isToday ? 'font-semibold text-accent-text' : 'text-text-secondary'}`}>
                {d.day}
              </div>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((p) => {
                  const type = normalizeProjectType(p.task_type);
                  const Icon = TYPE_ICON[type];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelect(p.id)}
                      className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] ${TYPE_COLOR[type]} hover:opacity-90`}
                      title={p.title}
                    >
                      <Icon size={9} className="shrink-0" />
                      <span className="truncate">{p.title}</span>
                    </button>
                  );
                })}
                {items.length > 3 && (
                  <div className="px-1 text-[10px] text-text-tertiary">+{items.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-nativz-border px-4 py-2 text-[11px] text-text-tertiary">
        <span className="font-medium">Legend:</span>
        {(['shoot', 'edit', 'task', 'content'] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className={`h-2 w-2 rounded-sm ${TYPE_COLOR[t].split(' ')[0]}`} />
            <span className="capitalize">{t}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
