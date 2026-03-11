'use client';

import { useState, useEffect } from 'react';
import {
  Briefcase,
  Mail,
  Building2,
  ListTodo,
  Loader2,
  Plus,
  Pencil,
  Check,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface TeamMember {
  id: string;
  full_name: string;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
  is_active: boolean;
  user_id: string | null;
}

interface ClientInfo {
  name: string;
  slug: string;
}

interface TaskInfo {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
}

interface TeamMemberModalProps {
  member: TeamMember | null;
  assignments: ClientInfo[];
  todoCount: number;
  onClose: () => void;
  onMemberUpdated: (member: TeamMember) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function TeamMemberModal({
  member,
  assignments,
  todoCount,
  onClose,
  onMemberUpdated,
}: TeamMemberModalProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', role: '' });
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  useEffect(() => {
    if (!member) return;
    setForm({
      full_name: member.full_name,
      email: member.email ?? '',
      role: member.role ?? '',
    });
    setEditing(false);

    // Fetch tasks assigned to this team member
    setLoadingTasks(true);
    fetch(`/api/tasks?assignee_id=${member.id}&status=backlog,in_progress,review`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTasks(Array.isArray(data) ? data : data.tasks ?? []))
      .catch(() => setTasks([]))
      .finally(() => setLoadingTasks(false));
  }, [member]);

  if (!member) return null;

  async function handleSave() {
    if (!form.full_name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/team/${member!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim() || null,
          role: form.role.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to update');
      const updated = await res.json();
      onMemberUpdated(updated);
      setEditing(false);
      toast.success('Team member updated');
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTask() {
    if (!newTaskTitle.trim() || !member) return;
    setAddingTask(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          assignee_id: member.id,
          status: 'backlog',
          priority: 'low',
          task_type: 'content',
        }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const task = await res.json();
      setTasks((prev) => [task, ...prev]);
      setNewTaskTitle('');
      setShowAddTask(false);
      toast.success('Task assigned');
    } catch {
      toast.error('Failed to create task');
    } finally {
      setAddingTask(false);
    }
  }

  const priorityColors: Record<string, string> = {
    urgent: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-blue-400',
    low: 'text-text-muted',
  };

  return (
    <Dialog open={!!member} onClose={onClose} title="">
      <div className="space-y-5 -mt-2">
        {/* Header */}
        <div className="flex items-start gap-4">
          {member.avatar_url ? (
            <img
              src={member.avatar_url}
              alt={member.full_name}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-nativz-border shrink-0"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 ring-2 ring-nativz-border flex items-center justify-center shrink-0">
              <span className="text-lg font-semibold text-text-secondary">
                {getInitials(member.full_name)}
              </span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2">
                <input
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-1.5 text-sm text-text-primary"
                  placeholder="Full name"
                  autoFocus
                />
                <input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-1.5 text-sm text-text-primary"
                  placeholder="Email"
                />
                <input
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-1.5 text-sm text-text-primary"
                  placeholder="Role"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-text-primary">{member.full_name}</h2>
                  <button
                    onClick={() => setEditing(true)}
                    className="p-1 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
                {member.role && (
                  <p className="text-sm text-text-muted flex items-center gap-1.5 mt-0.5">
                    <Briefcase size={12} />
                    {member.role}
                  </p>
                )}
                {member.email && (
                  <p className="text-xs text-text-muted flex items-center gap-1.5 mt-0.5">
                    <Mail size={11} />
                    {member.email}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Stats */}
          <div className="flex gap-4 shrink-0 text-center">
            <div>
              <p className="text-xl font-bold text-text-primary">{assignments.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Clients</p>
            </div>
            <div>
              <p className="text-xl font-bold text-text-primary">{tasks.length || todoCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Tasks</p>
            </div>
          </div>
        </div>

        {/* Assigned clients */}
        {assignments.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Building2 size={12} />
              Assigned clients
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {assignments.map((client) => (
                <Badge key={client.slug} variant="info">
                  {client.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Open tasks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider flex items-center gap-1.5">
              <ListTodo size={12} />
              Open tasks
            </h3>
            <button
              onClick={() => setShowAddTask(!showAddTask)}
              className="text-xs text-accent-text hover:underline cursor-pointer flex items-center gap-1"
            >
              <Plus size={11} />
              Assign task
            </button>
          </div>

          {/* Add task form */}
          {showAddTask && (
            <div className="flex items-center gap-2 mb-3">
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                placeholder="Task title..."
                className="flex-1 rounded-lg border border-nativz-border bg-transparent px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
                autoFocus
              />
              <Button size="sm" onClick={handleAddTask} disabled={addingTask || !newTaskTitle.trim()}>
                {addingTask ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
              </Button>
            </div>
          )}

          {loadingTasks ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={16} className="animate-spin text-text-muted" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-xs text-text-muted/50 py-3 text-center">No open tasks</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface-hover transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityColors[task.priority] ?? 'text-text-muted'}`}
                    style={{ backgroundColor: 'currentColor' }}
                  />
                  <span className="text-sm text-text-primary truncate flex-1">{task.title}</span>
                  {task.due_date && (
                    <span className="text-[10px] text-text-muted shrink-0">
                      {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  <Badge variant="default" className="text-[9px]">{task.status.replace('_', ' ')}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
