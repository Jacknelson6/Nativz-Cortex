'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Clock3,
  FileVideo,
  Loader2,
  Plus,
  RefreshCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientLogo } from '@/components/clients/client-logo';
import {
  EDITING_STATUS_LABEL,
  EDITING_TYPE_LABEL,
  type EditingProject,
  type EditingProjectStatus,
} from '@/lib/editing/types';
import { EditingNewProjectDialog } from './editing-new-project-dialog';
import { EditingProjectDetail } from './editing-project-detail';

/**
 * Editing tab. Internal pipeline for short-form video projects:
 *
 *   Draft       editor uploading footage and assembling cuts
 *   In review   editor flagged ready, ops needs to approve
 *   Approved    ready for Quick Schedule to pick up
 *   Scheduled   already pushed into the calendar
 *   Posted      lives on a Zernio account, kept for history
 *   Archived    soft-deleted; hidden by default
 *
 * Cards on each column show the brand logo, project name, type, and a
 * count of uploaded clips. Clicking a card opens the right-side detail
 * panel (drag-drop upload, video grid, status controls, notes).
 *
 * Internal projects feed Quick Schedule so editors don't have to drive
 * Monday for hand-off; the existing Drive/Monday flow stays plumbed
 * via the optional `drive_folder_url` on the project.
 */

const COLUMNS: EditingProjectStatus[] = [
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'posted',
];

export function EditingTab() {
  const [projects, setProjects] = useState<EditingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/admin/editing/projects', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load editing projects');
      const data = (await res.json()) as { projects: EditingProject[] };
      setProjects(data.projects ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<EditingProjectStatus, EditingProject[]>();
    for (const status of COLUMNS) map.set(status, []);
    for (const p of projects) {
      const list = map.get(p.status);
      if (list) list.push(p);
    }
    return map;
  }, [projects]);

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId) ?? null
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'} across every brand
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh"
          >
            <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus size={14} />
            <span>New project</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <BoardSkeleton />
      ) : projects.length === 0 ? (
        <EmptyState onNew={() => setNewOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          {COLUMNS.map((status) => (
            <Column
              key={status}
              status={status}
              projects={grouped.get(status) ?? []}
              onOpen={(id) => setActiveProjectId(id)}
            />
          ))}
        </div>
      )}

      <EditingNewProjectDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={async (id) => {
          setNewOpen(false);
          await load(true);
          setActiveProjectId(id);
        }}
      />

      <EditingProjectDetail
        project={activeProject}
        onClose={() => setActiveProjectId(null)}
        onChanged={() => void load(true)}
      />
    </div>
  );
}

function Column({
  status,
  projects,
  onOpen,
}: {
  status: EditingProjectStatus;
  projects: EditingProject[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">
          {EDITING_STATUS_LABEL[status]}
        </h3>
        <span className="rounded-md bg-surface-hover px-1.5 py-0.5 text-[11px] text-text-muted">
          {projects.length}
        </span>
      </div>
      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-nativz-border/60 p-3 text-center text-[11px] text-text-muted">
          Nothing here
        </div>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} onOpen={() => onOpen(p.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
}: {
  project: EditingProject;
  onOpen: () => void;
}) {
  const ageLabel = describeAge(project.updated_at);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col gap-2 rounded-lg border border-nativz-border bg-background p-3 text-left transition-colors hover:border-accent/40 hover:bg-surface-hover"
    >
      <div className="flex items-center gap-2">
        <ClientLogo
          src={project.client_logo_url}
          name={project.client_name ?? 'Client'}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-text-muted">
            {project.client_name ?? 'Unassigned brand'}
          </p>
          <p className="truncate text-sm font-medium text-text-primary">
            {project.name}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-text-muted">
        <span className="rounded-md bg-surface-hover px-1.5 py-0.5">
          {EDITING_TYPE_LABEL[project.project_type]}
        </span>
        <span className="flex items-center gap-1">
          <FileVideo size={11} />
          {project.video_count}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Clock3 size={11} />
          {ageLabel}
        </span>
      </div>
    </button>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-nativz-border bg-surface p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-accent-text">
        <FileVideo size={20} />
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">No editing projects yet</p>
        <p className="mt-1 text-xs text-text-muted">
          Spin one up so editors can drop footage straight into Cortex instead of Drive.
        </p>
      </div>
      <Button size="sm" onClick={onNew}>
        <Plus size={14} />
        <span>New project</span>
      </Button>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
      {COLUMNS.map((status) => (
        <div
          key={status}
          className="rounded-xl border border-nativz-border bg-surface p-3"
        >
          <div className="mb-3 h-3 w-16 animate-pulse rounded bg-surface-hover" />
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg border border-nativz-border bg-background"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function describeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  return `${wk}w ago`;
}

// Re-exports kept here so the parent shell only imports one symbol.
export { EditingNewProjectDialog, EditingProjectDetail };
export { Loader2, CheckCircle2 };
