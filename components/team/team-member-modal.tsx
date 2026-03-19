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
  X,
  AtSign,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AccountActions } from './account-actions';
import { toast } from 'sonner';

interface TeamMember {
  id: string;
  full_name: string;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
  is_active: boolean;
  user_id: string | null;
  alias_emails?: string[] | null;
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
  const [aliasEmails, setAliasEmails] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState('');
  const [showAddAlias, setShowAddAlias] = useState(false);
  const [savingAlias, setSavingAlias] = useState(false);

  useEffect(() => {
    if (!member) return;
    setForm({
      full_name: member.full_name,
      email: member.email ?? '',
      role: member.role ?? '',
    });
    setAliasEmails(member.alias_emails ?? []);
    setEditing(false);
    setShowAddAlias(false);
    setNewAlias('');

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

  async function saveAliasEmails(updated: string[]) {
    setSavingAlias(true);
    try {
      const res = await fetch(`/api/team/${member!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias_emails: updated }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setAliasEmails(updated);
      toast.success('Alias emails updated');
    } catch {
      toast.error('Failed to update alias emails');
    } finally {
      setSavingAlias(false);
    }
  }

  function handleAddAlias() {
    const trimmed = newAlias.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      toast.error('Enter a valid email');
      return;
    }
    if (aliasEmails.includes(trimmed)) {
      toast.error('Already added');
      return;
    }
    const updated = [...aliasEmails, trimmed];
    saveAliasEmails(updated);
    setNewAlias('');
    setShowAddAlias(false);
  }

  function handleRemoveAlias(email: string) {
    const updated = aliasEmails.filter(e => e !== email);
    saveAliasEmails(updated);
  }

  const priorityColors: Record<string, string> = {
    urgent: 'bg-red-400',
    high: 'bg-orange-400',
    medium: 'bg-blue-400',
    low: 'bg-gray-400',
  };

  const taskCount = tasks.length || todoCount;

  return (
    <Dialog open={!!member} onClose={onClose} title="">
      <div className="space-y-5 -mt-2">
        {/* Header */}
        <div className="flex items-center gap-4">
          {member.avatar_url ? (
            <img
              src={member.avatar_url}
              alt={member.full_name}
              className="h-12 w-12 rounded-full object-cover ring-1 ring-nativz-border shrink-0"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 ring-1 ring-nativz-border flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-text-secondary">
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

                {/* Alias emails inline editor */}
                <div className="rounded-lg border border-nativz-border/50 p-2 space-y-1.5">
                  <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider flex items-center gap-1">
                    <AtSign size={9} />
                    Alias emails
                  </p>
                  {aliasEmails.length > 0 && (
                    <div className="space-y-0.5">
                      {aliasEmails.map((alias) => (
                        <div key={alias} className="flex items-center gap-1.5 group">
                          <Mail size={9} className="text-text-muted/40 shrink-0" />
                          <span className="text-[11px] text-text-secondary flex-1 truncate">{alias}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAlias(alias)}
                            className="opacity-0 group-hover:opacity-100 text-text-muted/40 hover:text-red-400 transition-all cursor-pointer p-0.5"
                          >
                            <X size={9} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <input
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAlias(); } }}
                      placeholder="Add alias email..."
                      className="flex-1 rounded-md border border-nativz-border/40 bg-transparent px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted/40"
                    />
                    <button
                      type="button"
                      onClick={handleAddAlias}
                      disabled={!newAlias.trim() || savingAlias}
                      className="text-[10px] text-accent-text hover:underline disabled:opacity-40 cursor-pointer"
                    >
                      {savingAlias ? '...' : 'Add'}
                    </button>
                  </div>
                </div>

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
                  <h2 className="text-base font-semibold text-text-primary">{member.full_name}</h2>
                  <button
                    onClick={() => setEditing(true)}
                    className="p-1 rounded-md text-text-muted/40 hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
                  >
                    <Pencil size={11} />
                  </button>
                </div>
                {member.role && (
                  <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5 whitespace-nowrap">
                    <Briefcase size={10} className="shrink-0" />
                    {member.role}
                  </p>
                )}
                {member.email && (
                  <p className="text-[11px] text-text-muted/60 flex items-center gap-1 mt-1 truncate">
                    <Mail size={10} className="shrink-0" />
                    {member.email}
                  </p>
                )}
              </>
            )}
          </div>

        </div>

        {/* Alias emails */}
        {!editing && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider flex items-center gap-1">
                <AtSign size={10} />
                Alias emails
              </h3>
              <button
                onClick={() => setShowAddAlias(!showAddAlias)}
                className="text-[10px] text-accent-text hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <Plus size={10} />
                Add alias
              </button>
            </div>

            {showAddAlias && (
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()}
                  placeholder="alias@example.com"
                  className="flex-1 rounded-lg border border-nativz-border bg-transparent px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
                  autoFocus
                />
                <Button size="sm" onClick={handleAddAlias} disabled={savingAlias || !newAlias.trim()}>
                  {savingAlias ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
                </Button>
              </div>
            )}

            {aliasEmails.length === 0 ? (
              <p className="text-[11px] text-text-muted/40 py-2 text-center">No alias emails</p>
            ) : (
              <div className="space-y-0.5">
                {aliasEmails.map((alias) => (
                  <div
                    key={alias}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-surface-hover transition-colors group"
                  >
                    <Mail size={10} className="text-text-muted/40 shrink-0" />
                    <span className="text-xs text-text-secondary truncate flex-1">{alias}</span>
                    <button
                      onClick={() => handleRemoveAlias(alias)}
                      disabled={savingAlias}
                      className="opacity-0 group-hover:opacity-100 text-text-muted/40 hover:text-red-400 transition-all cursor-pointer p-0.5"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Open tasks */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider flex items-center gap-1">
              <ListTodo size={10} />
              Open tasks
            </h3>
            <button
              onClick={() => setShowAddTask(!showAddTask)}
              className="text-[10px] text-accent-text hover:underline cursor-pointer flex items-center gap-0.5"
            >
              <Plus size={10} />
              Assign task
            </button>
          </div>

          {showAddTask && (
            <div className="flex items-center gap-2 mb-2">
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                placeholder="Task title..."
                className="flex-1 rounded-lg border border-nativz-border bg-transparent px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
                autoFocus
              />
              <Button size="sm" onClick={handleAddTask} disabled={addingTask || !newTaskTitle.trim()}>
                {addingTask ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
              </Button>
            </div>
          )}

          {loadingTasks ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 size={14} className="animate-spin text-text-muted/40" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-[11px] text-text-muted/40 py-2 text-center">No open tasks</p>
          ) : (
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-surface-hover transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityColors[task.priority] ?? 'bg-gray-400'}`} />
                  <span className="text-xs text-text-secondary truncate flex-1">{task.title}</span>
                  {task.due_date && (
                    <span className="text-[9px] text-text-muted/50 shrink-0">
                      {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Account linking */}
        <AccountActions
          memberId={member.id}
          memberEmail={member.email}
          linkedUserId={member.user_id}
        />
      </div>
    </Dialog>
  );
}
