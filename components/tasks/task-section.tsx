'use client';

import { AnimatePresence } from 'framer-motion';
import { Check, Calendar as CalendarIcon } from 'lucide-react';
import type { Task } from '@/components/tasks/types';
import { TaskRow } from './task-row';

export function TaskSection({
  label,
  count,
  dotColor,
  tasks,
  onToggleDone,
  onSelect,
  onUpdateDate,
  onDelete,
  addRow,
}: {
  label: string;
  count: number;
  dotColor?: string;
  defaultOpen?: boolean;
  tasks: Task[];
  onToggleDone: (task: Task) => void;
  onSelect: (task: Task) => void;
  onUpdateDate: (task: Task, date: string) => void;
  onDelete: (task: Task) => void;
  addRow?: React.ReactNode;
}) {
  if (count === 0 && !addRow) return null;

  return (
    <div className="mb-6">
      <div className="sticky top-0 z-10 flex items-center gap-2 w-full py-2 bg-background">
        {dotColor && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: dotColor }}
          />
        )}
        <span className="text-sm font-semibold text-text-secondary">{label}</span>
        <span className="text-xs text-text-muted ml-auto">{count}</span>
      </div>

      <AnimatePresence mode="popLayout">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggleDone={onToggleDone}
            onSelect={onSelect}
            onUpdateDate={onUpdateDate}
            onDelete={onDelete}
          />
        ))}
      </AnimatePresence>
      {addRow}
    </div>
  );
}

export function TodayEmpty({ addRow }: { addRow: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Check size={48} className="text-text-muted/30 mb-4" />
      <h3 className="text-lg font-semibold text-text-primary mb-1">All clear for today</h3>
      <p className="text-sm text-text-muted mb-6">Enjoy your day or add a task below</p>
      <div className="w-full max-w-md">{addRow}</div>
    </div>
  );
}

export function UpcomingEmpty({ addRow }: { addRow: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CalendarIcon size={48} className="text-text-muted/30 mb-4" />
      <h3 className="text-lg font-semibold text-text-primary mb-1">Nothing on the horizon</h3>
      <p className="text-sm text-text-muted mb-6">Add tasks to start planning ahead</p>
      <div className="w-full max-w-md">{addRow}</div>
    </div>
  );
}
