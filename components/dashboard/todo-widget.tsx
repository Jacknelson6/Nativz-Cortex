'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ListTodo, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import type { Task, TaskClient, TaskAssignee } from '@/components/tasks/types';
import { TaskRow } from '@/components/tasks/task-row';
import { TaskDetailPanel } from '@/components/tasks/task-detail-panel';
import { InlineAddTask } from '@/components/tasks/inline-add-task';
import { getToday, isDueOverdue, sortByPriority } from '@/components/tasks/task-constants';

const MAX_VISIBLE = 5;

export function TodoWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<TaskClient[]>([]);
  const [teamMembers, setTeamMembers] = useState<TaskAssignee[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  const today = getToday();

  useEffect(() => {
    // Load from cache instantly
    const cached = sessionStorage.getItem('todo-widget');
    if (cached) {
      try {
        const { tasks: t, clients: c, team: m } = JSON.parse(cached);
        if (t) setTasks(t);
        if (c) setClients(c);
        if (m) setTeamMembers(m);
        setLoading(false);
      } catch { /* ignore */ }
    }

    // Then refresh from API in background
    loadData();

    fetch('/api/todoist/sync?auto=true', { method: 'POST' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && !data.skipped && (data.pulled > 0 || data.pushed > 0)) {
          fetchTasks();
        }
      })
      .catch(() => {});
  }, []);

  async function loadData() {
    try {
      const [tasksRes, clientsRes, teamRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/clients?minimal=true'),
        fetch('/api/team'),
      ]);
      const [tasksData, clientsData, teamData] = await Promise.all([
        tasksRes.json(),
        clientsRes.json(),
        teamRes.json(),
      ]);
      const t = tasksData.tasks ?? (Array.isArray(tasksData) ? tasksData : []);
      const c = Array.isArray(clientsData) ? clientsData : clientsData.clients ?? [];
      const m = Array.isArray(teamData) ? teamData : teamData.members ?? [];
      setTasks(t);
      setClients(c);
      setTeamMembers(m);
      sessionStorage.setItem('todo-widget', JSON.stringify({ tasks: t, clients: c, team: m }));
    } catch {
      console.error('Failed to load todo widget data');
    } finally {
      setLoading(false);
    }
  }

  async function fetchTasks() {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data.tasks ?? (Array.isArray(data) ? data : []));
    } catch {
      console.error('Failed to fetch tasks');
    }
  }

  // Filter to today only, sorted by priority
  const todayTasks = useMemo(() => {
    const open = tasks.filter(
      (t) => t.status !== 'done' && t.due_date === today,
    );
    return sortByPriority(open);
  }, [tasks, today]);

  const visibleTasks = todayTasks.slice(0, MAX_VISIBLE);
  const hasMore = todayTasks.length > MAX_VISIBLE;

  const handleToggleDone = useCallback(async (task: Task) => {
    const newStatus = task.status === 'done' ? 'backlog' : 'done';
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    if (selectedTask?.id === task.id) {
      setSelectedTask((prev) => prev ? { ...prev, status: newStatus } : null);
    }
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
      toast.error('Failed to update task');
    }
  }, [selectedTask]);

  const handleUpdateDate = useCallback(async (task: Task, date: string) => {
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, due_date: date || null } : t));
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: date || null }),
    });
  }, []);

  const handleDelete = useCallback(async (task: Task) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    toast.success('Task deleted');
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
  }, []);

  const handleAddTask = useCallback((task: Task) => {
    setTasks((prev) => [task, ...prev]);
  }, []);

  const handleUpdateTask = useCallback((updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTask(updated);
  }, []);

  const handleDeleteTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTask(null);
  }, []);

  return (
    <Card className="h-full flex flex-col">
      <TaskDetailPanel
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleUpdateTask}
        onDelete={handleDeleteTask}
        clients={clients}
        teamMembers={teamMembers}
      />

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
          <ListTodo size={16} className="text-accent-text" />
          Today&apos;s tasks
        </h2>
        <span className="text-xs text-text-muted">{todayTasks.length} open</span>
      </div>

      <div className="min-h-0">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2 animate-pulse">
                <div className="h-5 w-5 rounded-full bg-surface-elevated" />
                <div className="flex-1 h-4 rounded bg-surface-elevated" />
              </div>
            ))}
          </div>
        ) : todayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6">
            <p className="text-sm text-text-muted">All caught up!</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {visibleTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggleDone={handleToggleDone}
                onSelect={setSelectedTask}
                onUpdateDate={handleUpdateDate}
                onDelete={handleDelete}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="border-t border-nativz-border/50 pt-2 flex items-center justify-between">
        <InlineAddTask
          defaultDate={today}
          clients={clients}
          teamMembers={teamMembers}
          onAdd={handleAddTask}
        />
        {hasMore && (
          <Link
            href="/admin/tasks"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent/20 transition-colors"
          >
            View all tasks
            <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </Card>
  );
}
