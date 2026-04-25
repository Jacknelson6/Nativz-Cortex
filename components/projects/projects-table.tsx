'use client';

import { useMemo, useState } from 'react';
import { Camera, Scissors, CheckSquare, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  type Project,
  STATUS_LABELS,
  SCHEDULED_LABELS,
  EDIT_LABELS,
  normalizeProjectType,
} from './types';
import { formatDueDate, isDueOverdue } from '@/components/tasks/task-constants';

interface ProjectsTableProps {
  projects: Project[];
  onUpdate: (project: Project) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

type SortKey = 'title' | 'type' | 'client' | 'assignee' | 'status' | 'due' | 'created';
type SortDir = 'asc' | 'desc';

const TYPE_ICON = {
  shoot: Camera,
  edit: Scissors,
  task: CheckSquare,
  content: CheckSquare,
  paid_media: CheckSquare,
  strategy: CheckSquare,
} as const;

export function ProjectsTable({ projects, onUpdate, onDelete, onSelect }: ProjectsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...projects].sort((a, b) => {
      const ax = sortValue(a, sortKey);
      const bx = sortValue(b, sortKey);
      if (ax === bx) return 0;
      if (ax === null) return 1;
      if (bx === null) return -1;
      return ax < bx ? -dir : dir;
    });
  }, [projects, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'title' ? 'asc' : 'desc');
    }
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-nativz-border bg-surface p-12 text-center">
        <p className="text-sm font-medium text-text-primary mb-1">No projects yet</p>
        <p className="text-xs text-text-tertiary">Use the New button to add a task, shoot, or edit.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-nativz-border bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-nativz-border bg-surface-hover/50 text-left text-xs uppercase tracking-wider text-text-tertiary">
          <tr>
            <SortableTh sortKey="title" current={sortKey} dir={sortDir} onClick={toggleSort} className="w-[28%]">Title</SortableTh>
            <SortableTh sortKey="type" current={sortKey} dir={sortDir} onClick={toggleSort}>Type</SortableTh>
            <SortableTh sortKey="client" current={sortKey} dir={sortDir} onClick={toggleSort}>Client</SortableTh>
            <SortableTh sortKey="assignee" current={sortKey} dir={sortDir} onClick={toggleSort}>Assignee</SortableTh>
            <SortableTh sortKey="status" current={sortKey} dir={sortDir} onClick={toggleSort}>Status</SortableTh>
            <SortableTh sortKey="due" current={sortKey} dir={sortDir} onClick={toggleSort}>Due</SortableTh>
            <th className="px-3 py-2.5 text-right">{/* actions */}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-nativz-border">
          {sorted.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectRow({
  project,
  onUpdate,
  onDelete,
  onSelect,
}: {
  project: Project;
  onUpdate: (p: Project) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const type = normalizeProjectType(project.task_type);
  const Icon = TYPE_ICON[type];
  const statusLabel = stageLabel(project, type);

  async function handleStatusChange(newStatus: Project['status']) {
    const optimistic: Project = { ...project, status: newStatus };
    onUpdate(optimistic);
    try {
      const res = await fetch(`/api/tasks/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      onUpdate(updated);
    } catch {
      onUpdate(project);
      toast.error('Failed to update status');
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${project.title}"?`)) return;
    onDelete(project.id);
    try {
      const res = await fetch(`/api/tasks/${project.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  }

  const dueDate = type === 'shoot' && project.shoot_start_at
    ? project.shoot_start_at.slice(0, 10)
    : type === 'edit' && project.edit_due_at
      ? project.edit_due_at.slice(0, 10)
      : project.due_date;

  return (
    <tr className="hover:bg-surface-hover/40 transition-colors">
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={() => onSelect(project.id)}
          className="flex items-center gap-2 text-left text-text-primary hover:text-accent-text"
        >
          <span className="font-medium truncate">{project.title}</span>
        </button>
      </td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
          <Icon size={11} />
          <span className="capitalize">{type === 'paid_media' ? 'Paid media' : type}</span>
        </span>
      </td>
      <td className="px-3 py-2.5 text-text-secondary">
        {project.clients?.name ?? <span className="text-text-tertiary">—</span>}
      </td>
      <td className="px-3 py-2.5 text-text-secondary">
        {project.team_members?.full_name ?? <span className="text-text-tertiary">Unassigned</span>}
      </td>
      <td className="px-3 py-2.5">
        <select
          value={project.status}
          onChange={(e) => handleStatusChange(e.target.value as Project['status'])}
          className="rounded border border-nativz-border bg-surface px-2 py-0.5 text-xs text-text-primary"
        >
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {statusLabel && (
          <span className="ml-2 text-xs text-text-tertiary">· {statusLabel}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs">
        {dueDate ? (
          <span className={isDueOverdue(dueDate) ? 'text-red-400' : 'text-text-secondary'}>
            {formatDueDate(dueDate)}
          </span>
        ) : (
          <span className="text-text-tertiary">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Delete project"
          className="text-text-tertiary hover:text-red-400 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

function SortableTh({
  sortKey,
  current,
  dir,
  onClick,
  children,
  className,
}: {
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (key: SortKey) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th className={`px-3 py-2.5 font-medium ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 ${active ? 'text-text-primary' : 'hover:text-text-primary'}`}
      >
        <span>{children}</span>
        {active && <span aria-hidden>{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

function sortValue(p: Project, key: SortKey): string | number | null {
  switch (key) {
    case 'title': return p.title.toLowerCase();
    case 'type': return p.task_type ?? '';
    case 'client': return p.clients?.name?.toLowerCase() ?? null;
    case 'assignee': return p.team_members?.full_name?.toLowerCase() ?? null;
    case 'status': return p.status;
    case 'due': return p.due_date ?? p.shoot_start_at ?? p.edit_due_at ?? null;
    case 'created': return p.created_at;
  }
}

function stageLabel(p: Project, type: ReturnType<typeof normalizeProjectType>): string | null {
  if (type === 'shoot' && p.scheduled_status) return SCHEDULED_LABELS[p.scheduled_status];
  if (type === 'edit' && p.edit_status) return EDIT_LABELS[p.edit_status];
  return null;
}
