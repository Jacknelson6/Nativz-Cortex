'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, User, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import type { Task, TaskClient, TaskAssignee } from '@/components/tasks/types';
import { TaskDetailPanel } from '@/components/tasks/task-detail-panel';
import { TaskSection, TodayEmpty, UpcomingEmpty } from '@/components/tasks/task-section';
import { TaskRow } from '@/components/tasks/task-row';
import { InlineAddTask } from '@/components/tasks/inline-add-task';
import { getToday, getDateString, formatSectionDate, isDueOverdue, sortByPriority } from '@/components/tasks/task-constants';
import { SelectTrigger } from '@/components/tasks/select-popover';

type ViewTab = 'today' | 'upcoming' | 'all';

export default function AdminTasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get('view') as ViewTab) || 'today';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<TaskClient[]>([]);
  const [teamMembers, setTeamMembers] = useState<TaskAssignee[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [myTeamMemberId, setMyTeamMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>(searchParams.get('assignee') ?? '');
  const [filterClientId, setFilterClientId] = useState<string>(searchParams.get('client') ?? '');

  useEffect(() => {
    async function load() {
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
        setTasks(tasksData.tasks ?? (Array.isArray(tasksData) ? tasksData : []));
        setIsOwner(!!tasksData.is_owner);
        setMyTeamMemberId(tasksData.my_team_member_id ?? null);
        setClients(Array.isArray(clientsData) ? clientsData : clientsData.clients ?? []);
        setTeamMembers(Array.isArray(teamData) ? teamData : teamData.members ?? []);

        // Auto-sync with Todoist on page load (only if connected)
        if (tasksData.todoist_connected) {
          fetch('/api/todoist/sync?auto=true', { method: 'POST' })
            .then((r) => r.ok ? r.json() : null)
            .then((syncData) => {
              if (syncData && !syncData.skipped && (syncData.pulled > 0 || syncData.pushed > 0)) {
                // Re-fetch tasks to pick up synced changes
                fetch('/api/tasks')
                  .then((r) => r.json())
                  .then((refreshed) => {
                    setTasks(refreshed.tasks ?? (Array.isArray(refreshed) ? refreshed : []));
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
      } catch {
        toast.error('Failed to load tasks');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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

  const handleRowUpdateDate = useCallback(async (task: Task, date: string) => {
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, due_date: date || null } : t));
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: date || null }),
    });
  }, []);

  const handleRowDelete = useCallback(async (task: Task) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    toast.success('Task deleted');
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
  }, []);

  function buildParams(overrides: Record<string, string> = {}) {
    const params = new URLSearchParams();
    const vals = { view, assignee: filterAssigneeId, client: filterClientId, ...overrides };
    if (vals.view) params.set('view', vals.view);
    if (vals.assignee) params.set('assignee', vals.assignee);
    if (vals.client) params.set('client', vals.client);
    return params.toString();
  }

  function setView(v: ViewTab) {
    router.push(`/admin/tasks?${buildParams({ view: v })}`, { scroll: false });
  }

  function handleAssigneeFilter(id: string) {
    setFilterAssigneeId(id);
    router.push(`/admin/tasks?${buildParams({ assignee: id })}`, { scroll: false });
  }

  function handleClientFilter(id: string) {
    setFilterClientId(id);
    router.push(`/admin/tasks?${buildParams({ client: id })}`, { scroll: false });
  }

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filterAssigneeId === 'unassigned') result = result.filter(t => !t.assignee_id);
    else if (filterAssigneeId) result = result.filter(t => t.assignee_id === filterAssigneeId);
    if (filterClientId === 'none') result = result.filter(t => !t.client_id);
    else if (filterClientId) result = result.filter(t => t.client_id === filterClientId);
    return result;
  }, [tasks, filterAssigneeId, filterClientId]);

  // Other team members (exclude self — "Me" covers the current user)
  const otherTeamMembers = useMemo(
    () => teamMembers.filter((m) => m.id !== myTeamMemberId),
    [teamMembers, myTeamMemberId],
  );

  const today = getToday();
  const activeTasks = useMemo(() => filteredTasks.filter((t) => t.status !== 'done'), [filteredTasks]);
  const completedTasks = useMemo(() => filteredTasks.filter((t) => t.status === 'done'), [filteredTasks]);
  const activeCount = activeTasks.length;

  const overdueTasks = useMemo(() => sortByPriority(activeTasks.filter((t) => t.due_date && isDueOverdue(t.due_date))), [activeTasks]);
  const todayTasks = useMemo(() => sortByPriority(activeTasks.filter((t) => t.due_date === today)), [activeTasks, today]);
  const noDateTasks = useMemo(() => sortByPriority(activeTasks.filter((t) => !t.due_date)), [activeTasks]);
  const completedToday = useMemo(() => completedTasks.filter((t) => t.due_date === today), [completedTasks, today]);

  const upcomingGroups = useMemo(() => {
    const groups: { date: string; label: string; tasks: Task[] }[] = [];
    for (let i = 0; i <= 13; i++) {
      const date = getDateString(i);
      const label = formatSectionDate(date);
      const dateTasks = sortByPriority(activeTasks.filter((t) => t.due_date === date));
      if (dateTasks.length > 0) {
        groups.push({ date, label, tasks: dateTasks });
      }
    }
    return groups;
  }, [activeTasks]);

  // Initial load is covered by loading.tsx; we skip the in-component
  // skeleton so the user never sees a second loading state after the
  // route-level one.

  const todayHasTasks = overdueTasks.length > 0 || todayTasks.length > 0;

  return (
    <div className="cortex-page-gutter max-w-4xl mx-auto">
      <TaskDetailPanel
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleUpdateTask}
        onDelete={handleDeleteTask}
        clients={clients}
        teamMembers={teamMembers}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="ui-page-title">
            {view === 'today' ? 'Today' : view === 'upcoming' ? 'Upcoming' : 'All tasks'}
          </h1>
          <p className="text-sm text-text-muted mt-0.5 flex items-center gap-1.5">
            <Check size={14} />
            {activeCount} {activeCount === 1 ? 'task' : 'tasks'}
            {(filterAssigneeId || filterClientId) && (
              <button
                onClick={() => { handleAssigneeFilter(''); handleClientFilter(''); }}
                className="ml-1 text-accent-text hover:underline cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SelectTrigger
            options={[
              { value: '', label: 'All clients' },
              { value: 'none', label: 'No client' },
              ...clients.map(c => ({ value: c.id, label: c.name })),
            ]}
            value={filterClientId}
            onChange={handleClientFilter}
            icon={<Inbox size={12} />}
            placeholder="All clients"
            searchable={clients.length > 5}
            className="h-8 rounded-lg border border-nativz-border/60 px-2.5 text-xs text-text-muted hover:text-text-secondary hover:border-nativz-border"
            width={200}
          />
          {isOwner && (
            <SelectTrigger
              options={[
                { value: '', label: 'Everyone' },
                { value: 'unassigned', label: 'Unassigned' },
                ...teamMembers.map(m => ({ value: m.id, label: m.full_name })),
              ]}
              value={filterAssigneeId}
              onChange={handleAssigneeFilter}
              icon={<User size={12} />}
              placeholder="Everyone"
              searchable={teamMembers.length > 5}
              className="h-8 rounded-lg border border-nativz-border/60 px-2.5 text-xs text-text-muted hover:text-text-secondary hover:border-nativz-border"
              width={200}
            />
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={() => setView('today')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                view === 'today'
                  ? 'font-semibold text-text-primary bg-surface-hover'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setView('upcoming')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                view === 'upcoming'
                  ? 'font-semibold text-text-primary bg-surface-hover'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setView('all')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                view === 'all'
                  ? 'font-semibold text-text-primary bg-surface-hover'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {view === 'today' ? (
        todayHasTasks || noDateTasks.length > 0 ? (
          <>
            <TaskSection label="Overdue" count={overdueTasks.length} dotColor="#ef4444" tasks={overdueTasks} onToggleDone={handleToggleDone} onSelect={setSelectedTask} onUpdateDate={handleRowUpdateDate} onDelete={handleRowDelete} />
            <TaskSection label="Today" count={todayTasks.length} dotColor="#3b82f6" tasks={todayTasks} onToggleDone={handleToggleDone} onSelect={setSelectedTask} onUpdateDate={handleRowUpdateDate} onDelete={handleRowDelete} addRow={<InlineAddTask defaultDate={today} clients={clients} teamMembers={otherTeamMembers} onAdd={handleAddTask} />} />
            {noDateTasks.length > 0 && (
              <TaskSection label="No date" count={noDateTasks.length} tasks={noDateTasks} onToggleDone={handleToggleDone} onSelect={setSelectedTask} onUpdateDate={handleRowUpdateDate} onDelete={handleRowDelete} addRow={<InlineAddTask clients={clients} teamMembers={otherTeamMembers} onAdd={handleAddTask} />} />
            )}
            {completedToday.length > 0 && (
              <div className="mt-4">
                <button onClick={() => setShowCompleted(!showCompleted)} className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
                  {showCompleted ? 'Hide' : 'Show'} {completedToday.length} completed
                </button>
                <AnimatePresence>
                  {showCompleted && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mt-2">
                      {completedToday.map((task) => (
                        <TaskRow key={task.id} task={task} onToggleDone={handleToggleDone} onSelect={setSelectedTask} onUpdateDate={handleRowUpdateDate} onDelete={handleRowDelete} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </>
        ) : (
          <TodayEmpty addRow={<InlineAddTask defaultDate={today} clients={clients} teamMembers={otherTeamMembers} onAdd={handleAddTask} />} />
        )
      ) : view === 'upcoming' ? (
        upcomingGroups.some((g) => g.tasks.length > 0) || noDateTasks.length > 0 ? (
          <>
            {upcomingGroups.map((group) => (
              <TaskSection key={group.date} label={group.label} count={group.tasks.length} dotColor={group.date === today ? '#3b82f6' : undefined} tasks={group.tasks} onToggleDone={handleToggleDone} onSelect={setSelectedTask} onUpdateDate={handleRowUpdateDate} onDelete={handleRowDelete} addRow={<InlineAddTask defaultDate={group.date} clients={clients} teamMembers={otherTeamMembers} onAdd={handleAddTask} />} />
            ))}
            {noDateTasks.length > 0 && (
              <TaskSection label="No date" count={noDateTasks.length} tasks={noDateTasks} onToggleDone={handleToggleDone} onSelect={setSelectedTask} onUpdateDate={handleRowUpdateDate} onDelete={handleRowDelete} addRow={<InlineAddTask clients={clients} teamMembers={otherTeamMembers} onAdd={handleAddTask} />} />
            )}
            {completedTasks.length > 0 && (
              <div className="mt-4 mb-8">
                <button onClick={() => setShowCompleted(!showCompleted)} className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
                  {showCompleted ? 'Hide' : 'Show'} {completedTasks.length} completed
                </button>
                <AnimatePresence>
                  {showCompleted && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mt-2">
                      {completedTasks.map((task) => (
                        <TaskRow key={task.id} task={task} onToggleDone={handleToggleDone} onSelect={setSelectedTask} onUpdateDate={handleRowUpdateDate} onDelete={handleRowDelete} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </>
        ) : (
          <UpcomingEmpty addRow={<InlineAddTask defaultDate={today} clients={clients} teamMembers={otherTeamMembers} onAdd={handleAddTask} />} />
        )
      ) : (
        /* All view — every task sorted by priority */
        <>
          <TaskSection label="Active" count={activeTasks.length} tasks={sortByPriority(activeTasks)} onToggleDone={handleToggleDone} onSelect={setSelectedTask} onUpdateDate={handleRowUpdateDate} onDelete={handleRowDelete} addRow={<InlineAddTask clients={clients} teamMembers={otherTeamMembers} onAdd={handleAddTask} />} />
          {completedTasks.length > 0 && (
            <div className="mt-4 mb-8">
              <button onClick={() => setShowCompleted(!showCompleted)} className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
                {showCompleted ? 'Hide' : 'Show'} {completedTasks.length} completed
              </button>
              <AnimatePresence>
                {showCompleted && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mt-2">
                    {completedTasks.map((task) => (
                      <TaskRow key={task.id} task={task} onToggleDone={handleToggleDone} onSelect={setSelectedTask} onUpdateDate={handleRowUpdateDate} onDelete={handleRowDelete} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  );
}
