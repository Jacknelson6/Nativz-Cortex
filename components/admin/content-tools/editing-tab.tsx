'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileVideo, Plus, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type EditingProject } from '@/lib/editing/types';
import { EditingNewProjectDialog } from './editing-new-project-dialog';
import { EditingProjectDetail } from './editing-project-detail';
import {
  PipelineTable,
  type PipelineColumnKey,
  type PipelineSortState,
} from './pipeline-table';

/**
 * Editor-facing list of editing projects. Replaces the old kanban view
 * (Goal 17). Editors see one row per project with the strategy summary
 * surfaced through the brief, who the strategist is, raw footage
 * availability, and how many edited cuts have been delivered.
 *
 * Default sort matches the editor's mental model: most-recently-updated
 * first so projects with new strategist input or fresh raw uploads
 * float to the top. Click any header to re-sort.
 */

const COLUMNS: PipelineColumnKey[] = [
  'brand',
  'name',
  'status',
  'shoot_date',
  'strategist',
  'editor',
  'raws',
  'edits',
  'updated_at',
];

export function EditingTab() {
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
      toast.error(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId) ?? null
    : null;

  const subtitle = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} across every brand`;
  const actions = (
    <>
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
    </>
  );

  return (
    <div className="space-y-4">
      {loading ? (
        <TableSkeleton />
      ) : (
        <PipelineTable
          projects={projects}
          columns={COLUMNS}
          sort={sort}
          onSortChange={setSort}
          onOpen={(id) => setActiveProjectId(id)}
          onReload={() => void load(true)}
          emptyState={<EmptyState onNew={() => setNewOpen(true)} />}
          chrome={{
            icon: <FileVideo className="size-4" />,
            title: 'Editing',
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

// Keep the dialog re-exports so the parent shell only imports one symbol
// from this file (matches the pre-rewrite contract).
export { EditingNewProjectDialog, EditingProjectDetail };
