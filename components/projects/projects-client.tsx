'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  LayoutGrid,
  Table as TableIcon,
  Calendar as CalendarIcon,
  Plus,
  Search,
  Camera,
  Scissors,
  CheckSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  type Project,
  type ProjectViewMode,
  type ProjectTypeFilter,
  type TaskClient,
  type TaskAssignee,
  TYPE_PILLS,
  STATUS_LABELS,
  SCHEDULED_LABELS,
  EDIT_LABELS,
  normalizeProjectType,
  denormalizeProjectType,
} from './types';
import { ProjectsTable } from './projects-table';
import { ProjectsBoard } from './projects-board';
import { ProjectsCalendar } from './projects-calendar';
import { ProjectDetailPanel } from './project-detail-panel';

const VIEW_OPTIONS: { value: ProjectViewMode; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'board', label: 'Board', icon: LayoutGrid },
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'calendar', label: 'Calendar', icon: CalendarIcon },
];

export function ProjectsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const view = (searchParams.get('view') as ProjectViewMode) || 'table';
  const typeFilter = (searchParams.get('type') as ProjectTypeFilter) || 'all';
  const clientFilter = searchParams.get('client') ?? '';
  const assigneeFilter = searchParams.get('assignee') ?? '';
  const search = searchParams.get('q') ?? '';

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<TaskClient[]>([]);
  const [team, setTeam] = useState<TaskAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => selectedId ? projects.find((p) => p.id === selectedId) ?? null : null,
    [projects, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
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
        if (cancelled) return;
        const rawTasks: Project[] = tasksData.tasks ?? (Array.isArray(tasksData) ? tasksData : []);
        setProjects(rawTasks);
        setClients(Array.isArray(clientsData) ? clientsData : clientsData.clients ?? []);
        setTeam(Array.isArray(teamData) ? teamData : teamData.members ?? []);
      } catch {
        if (!cancelled) toast.error('Failed to load projects');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let result = projects;
    if (typeFilter !== 'all') {
      result = result.filter((p) => normalizeProjectType(p.task_type) === typeFilter);
    }
    if (clientFilter === 'none') result = result.filter((p) => !p.client_id);
    else if (clientFilter) result = result.filter((p) => p.client_id === clientFilter);
    if (assigneeFilter === 'unassigned') result = result.filter((p) => !p.assignee_id);
    else if (assigneeFilter) result = result.filter((p) => p.assignee_id === assigneeFilter);
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      result = result.filter((p) =>
        p.title.toLowerCase().includes(needle) ||
        (p.description ?? '').toLowerCase().includes(needle),
      );
    }
    return result;
  }, [projects, typeFilter, clientFilter, assigneeFilter, search]);

  const counts = useMemo(() => {
    const c: Record<ProjectTypeFilter, number> = {
      all: projects.length, shoot: 0, edit: 0, task: 0, content: 0, paid_media: 0, strategy: 0,
    };
    for (const p of projects) {
      c[normalizeProjectType(p.task_type)]++;
    }
    return c;
  }, [projects]);

  const updateParams = useCallback((overrides: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    router.push(`/admin/projects${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }, [router, searchParams]);

  async function createProject(taskType: 'shoot' | 'edit' | 'task') {
    const titlePrompt = window.prompt(`New ${taskType === 'task' ? 'task' : taskType} title:`);
    if (!titlePrompt?.trim()) return;
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titlePrompt.trim(),
          task_type: denormalizeProjectType(taskType),
        }),
      });
      if (!res.ok) throw new Error();
      const created: Project = await res.json();
      setProjects((prev) => [created, ...prev]);
      toast.success(`${taskType === 'task' ? 'Task' : taskType.charAt(0).toUpperCase() + taskType.slice(1)} created`);
    } catch {
      toast.error('Failed to create');
    }
  }

  return (
    <div>
      <header className="mb-4 space-y-3">
        {/* Row 1: type pills (left) + new dropdown (right). Pills match the
            visual scale of <SectionTabs> — text-xs so they sit clearly under
            the page-level Pipelines/Tasks toggle. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPE_PILLS.map((pill) => {
              const active = typeFilter === pill.value;
              const count = counts[pill.value];
              return (
                <button
                  key={pill.value}
                  type="button"
                  onClick={() => updateParams({ type: pill.value === 'all' ? null : pill.value })}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-accent-surface text-accent-text ring-1 ring-inset ring-accent/40'
                      : 'text-text-secondary hover:bg-surface-hover/60 hover:text-text-primary'
                  }`}
                >
                  <span>{pill.label}</span>
                  <span className={`tabular-nums ${active ? 'opacity-80' : 'text-text-muted'}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <NewProjectButton onCreate={createProject} />
        </div>

        {/* Row 2: search · filters · view switcher. Mirrors the toolbar in
            /admin/clients (same border, surface, focus-ring treatment). */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => updateParams({ q: e.target.value || null })}
              placeholder="Search projects"
              className="w-full rounded-lg border border-nativz-border bg-surface-primary pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-1 focus:ring-accent-border transition-colors"
              aria-label="Search projects"
            />
          </div>

          <select
            value={clientFilter}
            onChange={(e) => updateParams({ client: e.target.value || null })}
            className="rounded-lg border border-nativz-border bg-surface-primary pl-3 pr-8 py-2 text-sm text-text-primary focus:border-accent-border focus:outline-none cursor-pointer"
            aria-label="Filter by client"
          >
            <option value="">All clients</option>
            <option value="none">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={assigneeFilter}
            onChange={(e) => updateParams({ assignee: e.target.value || null })}
            className="rounded-lg border border-nativz-border bg-surface-primary pl-3 pr-8 py-2 text-sm text-text-primary focus:border-accent-border focus:outline-none cursor-pointer"
            aria-label="Filter by assignee"
          >
            <option value="">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>

          <div className="ml-auto flex rounded-lg border border-nativz-border overflow-hidden">
            {VIEW_OPTIONS.map((opt) => {
              const active = view === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateParams({ view: opt.value === 'table' ? null : opt.value })}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-accent-surface text-accent-text'
                      : 'bg-surface-primary text-text-muted hover:text-text-secondary hover:bg-surface-hover/50'
                  }`}
                  title={opt.label}
                  aria-label={opt.label}
                  aria-pressed={active}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main>
        {loading ? null : view === 'table' ? (
          <ProjectsTable
            projects={filtered}
            onUpdate={(updated) => setProjects((prev) => prev.map((p) => p.id === updated.id ? updated : p))}
            onDelete={(id) => setProjects((prev) => prev.filter((p) => p.id !== id))}
            onSelect={setSelectedId}
          />
        ) : view === 'board' ? (
          <ProjectsBoard
            projects={filtered}
            onUpdate={(updated) => setProjects((prev) => prev.map((p) => p.id === updated.id ? updated : p))}
            onSelect={setSelectedId}
          />
        ) : (
          <ProjectsCalendar projects={filtered} onSelect={setSelectedId} />
        )}
      </main>

      <ProjectDetailPanel
        project={selected}
        onClose={() => setSelectedId(null)}
        onUpdate={(updated) => setProjects((prev) => prev.map((p) => p.id === updated.id ? updated : p))}
        onDelete={(id) => {
          setProjects((prev) => prev.filter((p) => p.id !== id));
          setSelectedId(null);
        }}
      />
    </div>
  );
}

function NewProjectButton({ onCreate }: { onCreate: (type: 'shoot' | 'edit' | 'task') => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="primary">
          <Plus size={14} />
          New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onCreate('task')}>
          <CheckSquare size={14} />
          <span>Task</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCreate('shoot')}>
          <Camera size={14} />
          <span>Shoot</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCreate('edit')}>
          <Scissors size={14} />
          <span>Edit</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { STATUS_LABELS, SCHEDULED_LABELS, EDIT_LABELS };
