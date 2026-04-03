'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { MoreHorizontal, Trash2, Repeat } from 'lucide-react';
import type { Task } from '@/components/tasks/types';
import { PriorityCheckbox } from './priority-checkbox';
import { DatePickerPopover } from './date-picker-popover';

function TaskRowMenu({
  onDateChange,
  onDelete,
  onClose,
  anchorRef,
  currentDate,
}: {
  onDateChange: (date: string) => void;
  onDelete: () => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  currentDate?: string | null;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const menuWidth = 280;
      const menuHeight = 520;
      let top = rect.bottom + 4;
      let left = rect.right - menuWidth;

      if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - menuHeight - 8);
      }
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      setPos({ top, left });
    }
  }, [anchorRef]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (pickerRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  if (!pos) return null;

  return createPortal(
    <div ref={wrapperRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 100 }}>
      <DatePickerPopover
        ref={pickerRef}
        value={currentDate ?? ''}
        showInput
        onChange={(date) => { onDateChange(date); onClose(); }}
        onClose={onClose}
      />
      {/* Delete button appended below the picker */}
      <div className="w-[280px] mt-1 rounded-xl border border-nativz-border bg-surface/80 backdrop-blur-xl shadow-dropdown px-2 py-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}
          className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
        >
          <Trash2 size={14} />
          <span>Delete</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function TaskRow({
  task,
  onToggleDone,
  onSelect,
  onUpdateDate,
  onDelete,
}: {
  task: Task;
  onToggleDone: (task: Task) => void;
  onSelect: (task: Task) => void;
  onUpdateDate: (task: Task, date: string) => void;
  onDelete: (task: Task) => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const isDone = task.status === 'done';
  const isChecked = isDone || completing;

  // Reset completing state when task status changes (e.g. API failure reverts it)
  const prevStatusRef = useRef(task.status);
  if (prevStatusRef.current !== task.status) {
    prevStatusRef.current = task.status;
    if (completing && task.status !== 'done') {
      setCompleting(false);
    }
  }

  function handleToggle() {
    if (isDone) {
      onToggleDone(task);
      return;
    }
    setCompleting(true);
    onToggleDone(task);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: completing ? 0 : 1, y: completing ? -8 : 0 }}
      exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
      transition={{
        layout: { duration: 0.2 },
        opacity: { duration: 0.3, delay: completing ? 0.6 : 0 },
        y: { duration: 0.3, delay: completing ? 0.6 : 0 },
      }}
      className="group border-b border-nativz-border/50"
    >
      <div
        onClick={() => { if (!menuOpen) onSelect(task); }}
        className="flex min-w-0 items-center gap-3 py-3 px-1 cursor-pointer hover:bg-surface-hover/30 transition-colors rounded-md -mx-1"
      >
        <div className="pt-0.5">
          <PriorityCheckbox
            priority={task.priority}
            checked={isChecked}
            onToggle={handleToggle}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={`min-w-0 truncate text-sm font-medium transition-all duration-200 ${
              isChecked
                ? 'line-through text-text-muted/60'
                : 'text-text-primary'
            }`}
          >
            {task.title}
          </p>
          {task.description && !isChecked && (
            <p className="mt-0.5 max-w-full truncate text-xs text-text-muted">
              {task.description.slice(0, 60)}
              {task.description.length > 60 ? '...' : ''}
            </p>
          )}
        </div>

        {task.recurrence && (
          <span className="flex items-center gap-1 text-xs text-green-400/70 shrink-0" title={task.recurrence}>
            <Repeat size={11} />
          </span>
        )}

        {task.team_members && (
          <span
            className="flex items-center gap-1 shrink-0"
            title={task.team_members.full_name}
          >
            {task.team_members.avatar_url ? (
              <img
                src={task.team_members.avatar_url}
                alt={task.team_members.full_name}
                className="w-5 h-5 rounded-full object-cover"
              />
            ) : (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-[10px] font-medium text-accent-text">
                {task.team_members.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </span>
            )}
          </span>
        )}

        {task.clients && (
          <span className="flex items-center gap-1 text-xs text-text-muted shrink-0">
            {task.clients.name}
          </span>
        )}

        <div className="shrink-0">
          <button
            ref={menuBtnRef}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="p-1 rounded-md text-text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-hover hover:text-text-secondary transition-all cursor-pointer"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <TaskRowMenu
              anchorRef={menuBtnRef}
              currentDate={task.due_date}
              onDateChange={(date) => onUpdateDate(task, date)}
              onDelete={() => onDelete(task)}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
