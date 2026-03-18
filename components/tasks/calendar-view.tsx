'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Task } from '@/components/tasks/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-blue-500',
  low: 'bg-white/30',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function clientColor(name: string): string {
  const colors = [
    'bg-blue-500/80',
    'bg-emerald-500/80',
    'bg-accent2',
    'bg-amber-500/80',
    'bg-pink-500/80',
    'bg-cyan-500/80',
    'bg-rose-500/80',
    'bg-teal-500/80',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CalendarViewProps {
  tasks: Task[];
  onToggleDone: (taskId: string, done: boolean) => void;
  onSelect: (task: Task) => void;
  onReschedule?: (taskId: string, newDate: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CalendarView({ tasks, onToggleDone, onSelect, onReschedule }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Build calendar grid
  const calendarDays = useMemo(() => {
    if (viewMode === 'month') {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startOffset = firstDay.getDay();
      const totalDays = lastDay.getDate();

      const days: Array<{ date: string; day: number; isCurrentMonth: boolean; isToday: boolean }> = [];

      // Previous month padding
      const prevMonthLast = new Date(year, month, 0).getDate();
      for (let i = startOffset - 1; i >= 0; i--) {
        const d = prevMonthLast - i;
        const dateStr = formatDateStr(year, month - 1, d);
        days.push({ date: dateStr, day: d, isCurrentMonth: false, isToday: false });
      }

      // Current month
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (let d = 1; d <= totalDays; d++) {
        const dateStr = formatDateStr(year, month, d);
        const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate();
        days.push({ date: dateStr, day: d, isCurrentMonth: true, isToday });
      }

      // Next month padding
      const remaining = 42 - days.length; // 6 rows x 7
      for (let d = 1; d <= remaining; d++) {
        const dateStr = formatDateStr(year, month + 1, d);
        days.push({ date: dateStr, day: d, isCurrentMonth: false, isToday: false });
      }

      return days;
    } else {
      // Week view — current week
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const days: Array<{ date: string; day: number; isCurrentMonth: boolean; isToday: boolean }> = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        days.push({
          date: dateStr,
          day: d.getDate(),
          isCurrentMonth: d.getMonth() === month,
          isToday: d.getTime() === today.getTime(),
        });
      }

      return days;
    }
  }, [year, month, currentDate, viewMode]);

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasks) {
      if (task.due_date) {
        (map[task.due_date] ??= []).push(task);
      }
    }
    return map;
  }, [tasks]);

  // Selected day tasks
  const selectedDayTasks = useMemo(() => {
    if (!selectedDay) return [];
    return tasksByDate[selectedDay] ?? [];
  }, [selectedDay, tasksByDate]);

  function navigate(delta: number) {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'month') {
        next.setMonth(next.getMonth() + delta);
      } else {
        next.setDate(next.getDate() + delta * 7);
      }
      return next;
    });
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Drag and drop for rescheduling
  function handleDrop(e: React.DragEvent, targetDate: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId && onReschedule) {
      onReschedule(taskId, targetDate);
    }
  }

  function handleDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData('text/plain', taskId);
  }

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text-primary">{monthLabel}</h2>
          <Button variant="ghost" size="xs" onClick={goToday}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5">
            <button
              onClick={() => setViewMode('month')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'month'
                  ? 'bg-white/[0.08] text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'week'
                  ? 'bg-white/[0.08] text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Week
            </button>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => navigate(1)}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Calendar grid */}
        <div className="flex-1">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {DAY_NAMES.map((day) => (
              <div key={day} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {day}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className={`grid grid-cols-7 gap-px rounded-xl overflow-hidden border border-nativz-border ${viewMode === 'week' ? '' : ''}`}>
            {calendarDays.map((day) => {
              const dayTasks = tasksByDate[day.date] ?? [];
              const isSelected = selectedDay === day.date;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDay(isSelected ? null : day.date)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, day.date)}
                  className={`relative flex flex-col items-start p-2 text-left transition-colors ${
                    viewMode === 'week' ? 'min-h-[160px]' : 'min-h-[90px]'
                  } ${
                    day.isCurrentMonth
                      ? 'bg-surface hover:bg-surface-hover'
                      : 'bg-surface/50'
                  } ${isSelected ? 'ring-1 ring-inset ring-accent/40' : ''}`}
                >
                  {/* Day number */}
                  <span
                    className={`text-xs font-medium mb-1 ${
                      day.isToday
                        ? 'flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white'
                        : day.isCurrentMonth
                          ? 'text-text-secondary'
                          : 'text-text-muted/40'
                    }`}
                  >
                    {day.day}
                  </span>

                  {/* Task dots / chips */}
                  {dayTasks.length > 0 && (
                    <div className="flex flex-col gap-0.5 w-full overflow-hidden">
                      {dayTasks.slice(0, viewMode === 'week' ? 6 : 3).map((task) => (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            handleDragStart(e, task.id);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(task);
                          }}
                          className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] truncate cursor-pointer hover:bg-white/[0.06] transition-colors ${
                            task.status === 'done' ? 'opacity-40 line-through' : ''
                          }`}
                          title={task.title}
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            task.clients
                              ? clientColor(task.clients.name)
                              : PRIORITY_DOT[task.priority]
                          }`} />
                          <span className="truncate text-text-secondary">{task.title}</span>
                        </div>
                      ))}
                      {dayTasks.length > (viewMode === 'week' ? 6 : 3) && (
                        <span className="text-[9px] text-text-muted px-1">
                          +{dayTasks.length - (viewMode === 'week' ? 6 : 3)} more
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day detail panel (shown when a day is selected) */}
        <AnimatePresence>
          {selectedDay && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 overflow-hidden"
            >
              <div className="w-80 rounded-xl border border-nativz-border bg-surface p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </h3>
                  <span className="text-xs text-text-muted">
                    {selectedDayTasks.length} task{selectedDayTasks.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {selectedDayTasks.length === 0 ? (
                  <p className="text-xs text-text-muted py-4 text-center">No tasks scheduled</p>
                ) : (
                  <div className="space-y-1">
                    {selectedDayTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-hover transition-colors cursor-pointer group"
                        onClick={() => onSelect(task)}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleDone(task.id, task.status !== 'done');
                          }}
                          className="shrink-0"
                        >
                          {task.status === 'done' ? (
                            <CheckCircle2 size={16} className="text-emerald-500" />
                          ) : (
                            <Circle size={16} className="text-text-muted/40 group-hover:text-text-muted transition-colors" />
                          )}
                        </button>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} />
                        <span className={`text-sm flex-1 truncate ${
                          task.status === 'done'
                            ? 'line-through text-text-muted'
                            : 'text-text-primary'
                        }`}>
                          {task.title}
                        </span>
                        {task.clients && (
                          <span className={`h-2 w-2 shrink-0 rounded-full ${clientColor(task.clients.name)}`} title={task.clients.name} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDateStr(year: number, month: number, day: number): string {
  const d = new Date(year, month, day);
  return d.toISOString().split('T')[0];
}
