'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Camera, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type EditingProject } from '@/lib/editing/types';
import { EditingProjectDetail } from './editing-project-detail';
import {
  PipelineTable,
  type PipelineColumnKey,
  type PipelineSortState,
} from './pipeline-table';

/**
 * Videographer-facing list. Strategists use this surface to:
 *
 *   - Confirm shoot dates the videographer is booked for
 *   - Drop a project brief on each row so the videographer knows
 *     what they're filming
 *   - Track which projects already have raw footage uploaded
 *   - Hand the project off to an editor once raws land
 *
 * The default sort is by shoot_date ascending so the next on-set day
 * is always at the top. Projects without a shoot_date sink to the
 * bottom (handled inside `sortProjectsBy`) so the unscheduled ones
 * don't drown the booked rows.
 *
 * We hide `posted` and `archived` rows by default; once a project has
 * shipped a videographer doesn't need to scroll past it. Toggle on
 * the chip to surface them.
 */

const COLUMNS: PipelineColumnKey[] = [
  'brand',
  'name',
  'shoot_date',
  'strategist',
  'videographer',
  'raws',
  'status',
  'updated_at',
];

const HIDDEN_BY_DEFAULT = new Set(['posted', 'archived']);

export function VideographerTab() {
  const [projects, setProjects] = useState<EditingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showShipped, setShowShipped] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sort, setSort] = useState<PipelineSortState>({
    field: 'shoot_date',
    dir: 'asc',
  });

  async function load(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/admin/editing/projects', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load projects');
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

  const visible = useMemo(() => {
    if (showShipped) return projects;
    return projects.filter((p) => !HIDDEN_BY_DEFAULT.has(p.status));
  }, [projects, showShipped]);

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId) ?? null
    : null;

  const shippedCount = projects.length - visible.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          {visible.length}{' '}
          {visible.length === 1 ? 'project' : 'projects'} on the shoot board
        </p>
        <div className="flex items-center gap-2">
          {shippedCount > 0 && !showShipped && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowShipped(true)}
            >
              Show {shippedCount} shipped
            </Button>
          )}
          {showShipped && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowShipped(false)}
            >
              Hide shipped
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh"
          >
            <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <PipelineTable
          projects={visible}
          columns={COLUMNS}
          sort={sort}
          onSortChange={setSort}
          onOpen={(id) => setActiveProjectId(id)}
          emptyState={<EmptyState />}
        />
      )}

      <EditingProjectDetail
        project={activeProject}
        onClose={() => setActiveProjectId(null)}
        onChanged={() => void load(true)}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-nativz-border bg-surface p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-accent-text">
        <Camera size={20} />
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">No shoots on deck</p>
        <p className="mt-1 text-xs text-text-muted">
          Create a project from the Editing tab and it will land here once a
          shoot date is set.
        </p>
      </div>
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
