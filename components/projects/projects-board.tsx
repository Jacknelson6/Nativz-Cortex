'use client';

import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Camera, Scissors, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';
import {
  type Project,
  STATUS_LABELS,
  normalizeProjectType,
} from './types';
import { formatDueDate, isDueOverdue } from '@/components/tasks/task-constants';

interface ProjectsBoardProps {
  projects: Project[];
  onUpdate: (project: Project) => void;
  onSelect: (id: string) => void;
}

type Status = Project['status'];

const STATUS_ORDER: Status[] = ['backlog', 'in_progress', 'review', 'done'];

const TYPE_ICON = {
  shoot: Camera,
  edit: Scissors,
  task: CheckSquare,
  content: CheckSquare,
  paid_media: CheckSquare,
  strategy: CheckSquare,
} as const;

export function ProjectsBoard({ projects, onUpdate, onSelect }: ProjectsBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const grouped = useMemo(() => {
    const buckets: Record<Status, Project[]> = {
      backlog: [], in_progress: [], review: [], done: [],
    };
    for (const p of projects) {
      buckets[p.status].push(p);
    }
    return buckets;
  }, [projects]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const projectId = String(e.active.id);
    const newStatus = e.over?.id as Status | undefined;
    if (!newStatus || !STATUS_ORDER.includes(newStatus)) return;

    const project = projects.find((p) => p.id === projectId);
    if (!project || project.status === newStatus) return;

    const optimistic: Project = { ...project, status: newStatus };
    onUpdate(optimistic);

    try {
      const res = await fetch(`/api/tasks/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      onUpdate(updated);
    } catch {
      onUpdate(project);
      toast.error('Failed to move project');
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            projects={grouped[status]}
            isDraggingOver={!!activeProject && activeProject.status !== status}
            onSelect={onSelect}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
        {activeProject ? <Card project={activeProject} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  projects,
  isDraggingOver,
  onSelect,
}: {
  status: Status;
  projects: Project[];
  isDraggingOver: boolean;
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const dropping = isOver && isDraggingOver;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg border bg-surface/50 transition-colors ${
        dropping ? 'border-accent-text bg-accent-surface/40' : 'border-nativz-border'
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-nativz-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {STATUS_LABELS[status]}
        </span>
        <span className="text-xs text-text-tertiary">{projects.length}</span>
      </div>
      <div className="flex flex-col gap-2 p-2 min-h-[120px]">
        {projects.length === 0 && (
          <p className="text-xs text-text-tertiary text-center py-6">No projects</p>
        )}
        {projects.map((p) => (
          <DraggableCard key={p.id} project={p} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({
  project,
  onSelect,
}: {
  project: Project;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Only trigger selection on a true click (not at the end of a drag).
        // dnd-kit prevents click events when a drag actually moved the element,
        // but we also gate on isDragging for safety.
        if (!isDragging) onSelect(project.id);
        e.stopPropagation();
      }}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-30' : ''}`}
    >
      <Card project={project} />
    </div>
  );
}

function Card({ project, dragging = false }: { project: Project; dragging?: boolean }) {
  const type = normalizeProjectType(project.task_type);
  const Icon = TYPE_ICON[type];
  const dueDate = type === 'shoot' && project.shoot_start_at
    ? project.shoot_start_at.slice(0, 10)
    : type === 'edit' && project.edit_due_at
      ? project.edit_due_at.slice(0, 10)
      : project.due_date;

  return (
    <div
      className={`rounded-lg border bg-surface p-3 transition-colors ${
        dragging
          ? 'shadow-elevated ring-1 ring-accent-text/30 border-accent-text/40'
          : 'border-nativz-border hover:border-accent-border/40 hover:bg-surface-hover/40'
      }`}
    >
      <div className="flex items-start gap-2 mb-2">
        <Icon size={12} className="mt-0.5 shrink-0 text-text-tertiary" />
        <span className="text-sm font-medium text-text-primary line-clamp-2">
          {project.title}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
        {project.clients?.name && <span>{project.clients.name}</span>}
        {project.team_members?.full_name && (
          <span className="rounded-full bg-surface-hover px-1.5 py-0.5">
            {initials(project.team_members.full_name)}
          </span>
        )}
        {dueDate && (
          <span className={isDueOverdue(dueDate) ? 'text-red-400' : ''}>
            {formatDueDate(dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
