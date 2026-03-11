'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Loader2,
  Trash2,
  ExternalLink,
  Clock,
  User,
  Tag,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Plus,
  ArrowRight,
  CalendarClock,
  Repeat,
  CheckSquare,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { DatePickerPopover } from './date-picker-popover';
import { SelectPopover } from './select-popover';

// ── Types ────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'backlog' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  client_id: string | null;
  assignee_id: string | null;
  due_date: string | null;
  task_type: string;
  tags: string[];
  created_at: string;
  monday_item_id?: string | null;
  recurrence?: string | null;
  todoist_task_id?: string | null;
  clients: { id: string; name: string; slug: string } | null;
  team_members: { id: string; full_name: string; avatar_url: string | null } | null;
}

interface ActivityEntry {
  id: string;
  action: string;
  description: string;
  created_at: string;
  user?: { full_name: string; avatar_url: string | null } | null;
}

interface TaskDetailPanelProps {
  task: Task | null;
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: (taskId: string) => void;
  clients: { id: string; name: string; slug: string }[];
  teamMembers: { id: string; full_name: string; avatar_url: string | null }[];
}

// ── Constants ────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const TYPE_OPTIONS = [
  { value: 'content', label: 'Content' },
  { value: 'shoot', label: 'Shoot' },
  { value: 'edit', label: 'Edit' },
  { value: 'paid_media', label: 'Paid media' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'other', label: 'Other' },
];

const PRIORITY_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  low: 'default',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

// ── DueDateField ────────────────────────────────────────────────────────

function formatDueLabel(dateStr: string): string {
  if (!dateStr) return 'No due date';
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) return 'Today';
  if (d.getFullYear() === tomorrow.getFullYear() && d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function DueDateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm hover:bg-white/[0.08] transition-colors cursor-pointer"
      >
        <CalendarClock size={16} className={value ? 'text-accent-text' : 'text-text-muted'} />
        <span className={`flex-1 text-left ${value ? 'text-text-primary' : 'text-text-muted'}`}>{formatDueLabel(value)}</span>
        <span className="text-xs text-text-muted">Due date</span>
      </button>
      {open && (
        <DatePickerPopover
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </>
  );
}

// ── PopoverField ─────────────────────────────────────────────────────────

function PopoverField({
  icon,
  label,
  displayValue,
  options,
  value,
  onChange,
  searchable,
}: {
  icon: React.ReactNode;
  label: string;
  displayValue: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm hover:bg-white/[0.08] transition-colors cursor-pointer"
      >
        {icon}
        <span className="text-text-primary flex-1 text-left">{displayValue}</span>
        <span className="text-xs text-text-muted">{label}</span>
      </button>
      {open && (
        <SelectPopover
          anchorRef={btnRef}
          options={options}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          searchable={searchable}
        />
      )}
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function activityIcon(action: string) {
  switch (action) {
    case 'created':
      return <Plus size={14} className="text-emerald-400" />;
    case 'status_change':
      return <ArrowRight size={14} className="text-blue-400" />;
    case 'comment':
      return <MessageSquare size={14} className="text-purple-400" />;
    case 'completed':
      return <CheckCircle2 size={14} className="text-emerald-400" />;
    case 'assigned':
      return <User size={14} className="text-amber-400" />;
    default:
      return <Edit3 size={14} className="text-text-muted" />;
  }
}

// ── Component ────────────────────────────────────────────────────────────

export function TaskDetailPanel({
  task,
  onClose,
  onUpdate,
  onDelete,
  clients,
  teamMembers,
}: TaskDetailPanelProps) {
  // Local editable state — synced from task prop
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Task['status']>('backlog');
  const [priority, setPriority] = useState<Task['priority']>('low');
  const [taskType, setTaskType] = useState('task');
  const [clientId, setClientId] = useState<string>('');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { confirm, dialog: confirmDialog } = useConfirm({
    title: 'Delete task',
    description: 'This action cannot be undone. Are you sure you want to delete this task?',
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  // Sync local state when task prop changes
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setStatus(task.status);
    setPriority(task.priority);
    setTaskType(task.task_type);
    setClientId(task.client_id ?? '');
    setAssigneeId(task.assignee_id ?? '');
    setDueDate(task.due_date ?? '');
  }, [task]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [description]);

  // Fetch activity log
  useEffect(() => {
    if (!task) return;
    setActivity([]);
    fetch(`/api/tasks/${task.id}/activity`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setActivity(Array.isArray(data) ? data : data.activity ?? []))
      .catch(() => setActivity([]));
  }, [task]);

  // Debounced save
  const saveField = useCallback(
    (patch: Partial<Task>) => {
      if (!task) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          const res = await fetch(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          if (!res.ok) throw new Error('Failed to save');
          const updated = await res.json();
          onUpdate(updated);
        } catch {
          toast.error('Failed to save changes');
        } finally {
          setSaving(false);
        }
      }, 500);
    },
    [task, onUpdate],
  );

  // Delete handler
  const handleDelete = async () => {
    if (!task) return;
    const ok = await confirm();
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Task deleted');
      onDelete(task.id);
    } catch {
      toast.error('Failed to delete task');
    } finally {
      setDeleting(false);
    }
  };

  // Build select options with empty "none" entry
  const clientOptions = [
    { value: '', label: 'No client' },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];
  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...teamMembers.map((m) => ({ value: m.id, label: m.full_name })),
  ];

  const modalContent = (
    <AnimatePresence>
      {task && (
        <>
          {/* Backdrop */}
          <motion.div
            key="task-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-black/60"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="task-panel"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-md max-h-[calc(100vh-4rem)] overflow-y-auto rounded-2xl border border-white/[0.08] bg-surface/80 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">

              {/* Header */}
              <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      saveField({ title: e.target.value });
                    }}
                    className="w-full bg-transparent text-sm font-semibold text-text-primary outline-none"
                    placeholder="Task title"
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-text-muted">
                      {relativeTime(task.created_at)}
                    </span>
                    {saving && (
                      <span className="flex items-center gap-1 text-xs text-text-muted">
                        <Loader2 size={10} className="animate-spin" />
                        Saving
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="cursor-pointer shrink-0 rounded-lg p-1 text-text-muted hover:bg-white/[0.08] hover:text-text-secondary transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Integration & recurrence badges */}
              {(task.monday_item_id || task.recurrence || task.todoist_task_id) && (
                <div className="flex items-center gap-1.5 px-4 pb-2 flex-wrap">
                  {task.recurrence && (
                    <Badge variant="success">
                      <Repeat size={10} className="mr-1" />
                      {task.recurrence}
                    </Badge>
                  )}
                  {task.todoist_task_id && (
                    <Badge variant="default">
                      <CheckSquare size={10} className="mr-1" />
                      Synced with Todoist
                    </Badge>
                  )}
                  {task.monday_item_id && (
                    <Badge variant="purple">
                      <ExternalLink size={10} className="mr-1" />
                      Imported from Monday.com
                    </Badge>
                  )}
                </div>
              )}

              {/* Fields */}
              <div className="px-2 py-1 space-y-0.5">
                <PopoverField
                  icon={<AlertCircle size={16} className={
                    priority === 'urgent' ? 'text-red-400' :
                    priority === 'high' ? 'text-orange-400' :
                    priority === 'medium' ? 'text-blue-400' : 'text-text-muted'
                  } />}
                  label="Priority"
                  displayValue={PRIORITY_OPTIONS.find(p => p.value === priority)?.label ?? 'Priority'}
                  options={PRIORITY_OPTIONS}
                  value={priority}
                  onChange={(val) => {
                    setPriority(val as Task['priority']);
                    saveField({ priority: val as Task['priority'] });
                  }}
                />

                <PopoverField
                  icon={<ExternalLink size={16} className="text-text-muted" />}
                  label="Client"
                  displayValue={clientId ? clients.find(c => c.id === clientId)?.name ?? 'Client' : 'No client'}
                  options={clientOptions}
                  value={clientId}
                  onChange={(val) => {
                    setClientId(val);
                    saveField({ client_id: val || null });
                  }}
                  searchable={clients.length > 5}
                />

                <PopoverField
                  icon={<User size={16} className="text-text-muted" />}
                  label="Assignee"
                  displayValue={assigneeId ? teamMembers.find(m => m.id === assigneeId)?.full_name ?? 'Assignee' : 'Unassigned'}
                  options={assigneeOptions}
                  value={assigneeId}
                  onChange={(val) => {
                    setAssigneeId(val);
                    saveField({ assignee_id: val || null });
                  }}
                  searchable={teamMembers.length > 5}
                />

                {/* Due date */}
                <DueDateField
                  value={dueDate}
                  onChange={(val) => {
                    setDueDate(val);
                    saveField({ due_date: val || null });
                  }}
                />
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Description */}
              <div className="px-4 py-3">
                <textarea
                  ref={textareaRef}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    saveField({ description: e.target.value || null });
                  }}
                  placeholder="Add a description..."
                  rows={2}
                  className="block w-full bg-transparent text-sm text-text-primary placeholder-text-muted/50 outline-none resize-none overflow-hidden"
                />
              </div>

              {/* Tags */}
              {task.tags.length > 0 && (
                <>
                  <div className="border-t border-white/[0.06]" />
                  <div className="px-4 py-3 flex flex-wrap gap-1.5">
                    {task.tags.map((tag) => (
                      <Badge key={tag} variant="default">
                        <Tag size={10} className="mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </>
              )}

              {/* Activity log */}
              {activity.length > 0 && (
                <>
                  <div className="border-t border-white/[0.06]" />
                  <div className="px-4 py-3 space-y-2 max-h-32 overflow-y-auto">
                    {activity.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 shrink-0">{activityIcon(entry.action)}</span>
                        <span className="text-text-secondary flex-1">{entry.description}</span>
                        <span className="text-text-muted shrink-0">{relativeTime(entry.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Delete */}
              <div className="border-t border-white/[0.06] px-2 py-1.5">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex cursor-pointer items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  {deleting ? 'Deleting...' : 'Delete task'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return (
    <>
      {createPortal(modalContent, document.body)}
      {confirmDialog}
    </>
  );
}
