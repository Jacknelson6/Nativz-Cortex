'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ListTodo, ArrowRight, Plus, Check, X, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';

type Task = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent' | null;
  clients: { id: string; name: string; slug: string } | null;
};

const PRIORITY_RING: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: 'rgba(255,255,255,0.2)',
};

const PRIORITY_FILL: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: 'rgba(255,255,255,0.15)',
};

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === tomorrow.getTime()) return 'Tomorrow';
  if (target < today) {
    const diff = Math.round((today.getTime() - target.getTime()) / 86400000);
    return `${diff}d overdue`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isDueOverdue(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return d < now;
}

function CheckCircle({
  priority,
  checked,
  onToggle,
}: {
  priority: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const ringColor = PRIORITY_RING[priority] ?? PRIORITY_RING.medium;
  const fillColor = PRIORITY_FILL[priority] ?? PRIORITY_FILL.medium;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="shrink-0 group/check cursor-pointer focus:outline-none"
      aria-label={checked ? 'Completed' : 'Mark done'}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" className="block">
        <circle
          cx="10"
          cy="10"
          r="8.5"
          fill={checked ? fillColor : 'transparent'}
          stroke={ringColor}
          strokeWidth="2"
          className="transition-all duration-200 ease-out group-hover/check:opacity-90"
          style={{ opacity: checked ? 1 : 0.7 }}
        />
        <path
          d="M6 10.5L8.5 13L14 7.5"
          fill="none"
          stroke={checked ? '#fff' : 'transparent'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 20,
            strokeDashoffset: checked ? 0 : 20,
            transition: 'stroke-dashoffset 150ms ease-out 50ms, stroke 100ms ease',
          }}
        />
      </svg>
    </button>
  );
}

function TaskRow({
  task,
  onComplete,
  onRemove,
}: {
  task: Task;
  onComplete: (task: Task) => void;
  onRemove: (taskId: string) => void;
}) {
  const [completing, setCompleting] = useState(false);
  const overdue = task.due_date && isDueOverdue(task.due_date);

  function handleToggle() {
    if (completing) return;
    setCompleting(true);
    onComplete(task);
    // Checkbox fills (200ms) → pause to admire (400ms) → fade out (300ms) → pause → remove
    setTimeout(() => onRemove(task.id), 1200);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: completing ? 0 : 1, y: completing ? -8 : 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{
        layout: { duration: 0.35, delay: 0.1 },
        opacity: { duration: 0.3, delay: completing ? 0.6 : 0 },
        y: { duration: 0.3, delay: completing ? 0.6 : 0 },
        height: { duration: 0.35 },
      }}
      className="border-b border-nativz-border/50"
    >
      <div className="flex items-start gap-3 py-3 px-1">
        <div className="pt-0.5">
          <CheckCircle
            priority={task.priority ?? 'low'}
            checked={completing}
            onToggle={handleToggle}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium transition-all duration-200 ${
              completing ? 'line-through text-text-muted/60' : 'text-text-primary'
            }`}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {task.clients && (
              <span className="text-xs text-text-muted">{task.clients.name}</span>
            )}
            {task.due_date && (
              <span
                className={`text-[11px] ${
                  overdue ? 'text-red-400' : 'text-text-muted'
                }`}
              >
                {formatDueDate(task.due_date)}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function InlineAddTask({ onAdded, centered }: { onAdded: () => void; centered?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  function reset() {
    setTitle('');
    setIsOpen(false);
  }

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmed,
          due_date: today,
          status: 'backlog',
          priority: 'low',
        }),
      });
      if (res.ok) {
        reset();
        onAdded();
      } else {
        toast.error('Failed to add task');
      }
    } catch {
      toast.error('Failed to add task');
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      reset();
    }
  }

  return (
    <div className="mt-1">
      <AnimatePresence mode="wait">
        {!isOpen ? (
          <motion.button
            key="add-btn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            whileHover={{ x: 2 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            onClick={() => setIsOpen(true)}
            className={`flex items-center gap-2 py-2 px-1 text-accent-text/70 hover:text-accent-text transition-colors cursor-pointer group ${centered ? 'justify-center' : 'w-full'}`}
          >
            <span className="relative flex items-center justify-center w-5 h-5">
              <span className="absolute inset-0 rounded-full bg-accent-text/0 group-hover:bg-accent-text scale-75 group-hover:scale-100 transition-all duration-200" />
              <Plus size={14} className="relative text-accent-text group-hover:text-white transition-colors duration-200" />
            </span>
            <span className="text-sm">Add task</span>
          </motion.button>
        ) : (
          <motion.div
            key="add-form"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="w-full rounded-xl border border-nativz-border bg-surface shadow-elevated">
              <div className="px-3 pt-3 pb-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Task name"
                  className="w-full bg-transparent text-sm font-medium text-text-primary placeholder-text-muted/50 outline-none"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center justify-end gap-1.5 px-3 py-2 border-t border-nativz-border/50">
                <button
                  onClick={reset}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
                  title="Cancel"
                >
                  <X size={14} />
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!title.trim() || submitting}
                  className="h-7 w-7 flex items-center justify-center rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40 cursor-pointer"
                  title="Add task"
                >
                  {submitting ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TodoWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch tasks first, then sync Todoist in background and refresh if anything changed
    fetchTasks();

    fetch('/api/todoist/sync?auto=true', { method: 'POST' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && !data.skipped && (data.pulled > 0 || data.pushed > 0)) {
          fetchTasks();
        }
      })
      .catch(() => { /* ignore sync errors */ });
  }, []);

  async function fetchTasks() {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.tasks && Array.isArray(data.tasks)) {
        // Filter out done tasks, sort: overdue first, then by due date, then priority
        const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        const todayStr = new Date().toISOString().split('T')[0];
        const open = data.tasks
          .filter((t: Task) => t.status !== 'done' && t.due_date && t.due_date <= todayStr)
          .sort((a: Task, b: Task) => {
            // Overdue first
            const aOverdue = a.due_date && isDueOverdue(a.due_date);
            const bOverdue = b.due_date && isDueOverdue(b.due_date);
            if (aOverdue && !bOverdue) return -1;
            if (!aOverdue && bOverdue) return 1;
            // Then by due date (soonest first, null last)
            if (a.due_date && b.due_date) {
              const cmp = a.due_date.localeCompare(b.due_date);
              if (cmp !== 0) return cmp;
            }
            if (a.due_date && !b.due_date) return -1;
            if (!a.due_date && b.due_date) return 1;
            // Then by priority
            const pa = priorityOrder[a.priority ?? ''] ?? 3;
            const pb = priorityOrder[b.priority ?? ''] ?? 3;
            return pa - pb;
          });
        setTasks(open);
      }
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    } finally {
      setLoading(false);
    }
  }

  const handleComplete = useCallback(async (task: Task) => {
    // Fire API immediately so refresh won't repopulate the task
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      if (!res.ok) {
        toast.error('Failed to complete task');
        fetchTasks();
      }
    } catch {
      toast.error('Failed to complete task');
      fetchTasks();
    }
  }, []);

  const handleRemove = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
          <ListTodo size={16} className="text-accent-text" />
          Today&apos;s tasks
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">{tasks.length} open</span>
          <Link
            href="/admin/tasks"
            className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors"
          >
            All tasks <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2 animate-pulse">
                <div className="h-5 w-5 rounded-full bg-surface-elevated" />
                <div className="flex-1 h-4 rounded bg-surface-elevated" />
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1">
            <p className="text-sm text-text-muted">All caught up!</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} onComplete={handleComplete} onRemove={handleRemove} />
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="border-t border-nativz-border/50">
        <InlineAddTask onAdded={fetchTasks} />
      </div>
    </Card>
  );
}
