'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FileVideo, Plus, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  type EditingProject,
  type EditingProjectType,
} from '@/lib/editing/types';
import { EditingNewProjectDialog } from './editing-new-project-dialog';
import { EditingProjectDetail } from './editing-project-detail';
import {
  PipelineTable,
  type PipelineColumnKey,
  type PipelineSortState,
} from './pipeline-table';

/**
 * Editing-projects panel that lives inside each project-type tab on
 * `/admin/content-tools`. Surfaces `editing_projects` rows so the team
 * can upload edited cuts straight to Mux, mint a share link, and send
 * the public `/c/edit/<token>` URL to the client POC for approval.
 *
 * The Projects table above this panel is keyed on
 * `content_drop_share_links` (calendar review links). Editing projects
 * live in a parallel data model (`editing_projects` + `editing_project_videos`).
 * Rather than unifying the two on the API right now, this panel
 * surfaces editing projects inline so the same tab gives Jack
 * everything he needs in one place.
 *
 * Tab → project_type filter mapping is owned by the parent shell. A
 * `projectType` of `null` shows every editing project (the "All
 * projects" tab); `'other'` collapses the `general` and `other`
 * buckets so nothing slips through the cracks.
 */

const COLUMNS: PipelineColumnKey[] = [
  'brand',
  'name',
  'status',
  'shoot_date',
  'editor',
  'raws',
  'edits',
  'updated_at',
];

interface EditingProjectsPanelProps {
  /**
   * Filter editing projects by their `project_type`. `null` returns
   * every editing project. The "Other" tab folds in the `general`
   * bucket so untyped pre-migration rows still show up.
   */
  projectType: EditingProjectType | EditingProjectType[] | null;
  /** Tab label. Used as the panel title and "no results" copy. */
  tabLabel: string;
}

export function EditingProjectsPanel({
  projectType,
  tabLabel,
}: EditingProjectsPanelProps) {
  const [projects, setProjects] = useState<EditingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sort, setSort] = useState<PipelineSortState>({
    field: 'updated_at',
    dir: 'desc',
  });

  async function load(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/admin/editing/projects', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load editing projects');
      const data = (await res.json()) as { projects: EditingProject[] };
      setProjects(data.projects ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to load editing projects',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    if (projectType === null) return projects;
    const types = Array.isArray(projectType) ? projectType : [projectType];
    return projects.filter((p) => types.includes(p.project_type));
  }, [projects, projectType]);

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId) ?? null
    : null;

  const subtitle =
    visible.length === 0
      ? 'Upload edited cuts, mint a share link, send to a POC for approval'
      : `${visible.length} ${visible.length === 1 ? 'project' : 'projects'} with edits or in flight`;

  const actions = (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void load(true)}
        disabled={refreshing}
        aria-label="Refresh editing projects"
      >
        <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
      </Button>
      <Button size="sm" onClick={() => setNewOpen(true)}>
        <Plus size={14} />
        <span>New project</span>
      </Button>
    </>
  );

  return (
    <div className="space-y-4">
      {loading ? (
        <TableSkeleton />
      ) : (
        <PipelineTable
          projects={visible}
          columns={COLUMNS}
          sort={sort}
          onSortChange={setSort}
          onOpen={(id) => setActiveProjectId(id)}
          onReload={() => void load(true)}
          emptyState={<EmptyState tabLabel={tabLabel} onNew={() => setNewOpen(true)} />}
          chrome={{
            icon: <FileVideo className="size-4" />,
            title: 'Editing projects',
            subtitle,
            actions,
          }}
        />
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

function EmptyState({
  tabLabel,
  onNew,
}: {
  tabLabel: string;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-nativz-border bg-surface p-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-surface text-accent-text">
        <FileVideo size={18} />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-medium text-text-primary">
          No editing projects under {tabLabel.toLowerCase()}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Spin one up so editors can upload cuts straight to Mux, then mint a
          share link to send to the client for review.
        </p>
      </div>
      <Button size="sm" onClick={onNew}>
        <Plus size={14} />
        <span>New project</span>
      </Button>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 rounded-xl border border-nativz-border bg-surface p-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-md bg-surface-hover"
        />
      ))}
    </div>
  );
}
