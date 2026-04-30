'use client';

import { useMemo } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  FileVideo,
  Scissors,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ClientLogo } from '@/components/clients/client-logo';
import {
  EDITING_STATUS_LABEL,
  EDITING_TYPE_LABEL,
  type EditingProject,
  type EditingProjectStatus,
} from '@/lib/editing/types';

/**
 * `PipelineTable` is the shared sortable view used by both the Editing
 * tab (editor-facing) and the Videographer tab (strategist-facing).
 *
 * It treats the underlying `editing_projects` row as the single source
 * of truth and exposes columns relevant to both roles. Callers pick
 * which columns to show via the `columns` prop, keeping the markup
 * lean per surface while sharing sort + render logic.
 *
 * Sorting:
 *   - Click a header to toggle direction. First click = asc, second =
 *     desc. Same axis as the legacy ReviewTable for muscle-memory.
 *   - `null` shoot dates always sink to the bottom regardless of dir
 *     (so a videographer scanning by shoot day sees the booked rows
 *     first, not a wall of dashes).
 *
 * The component is intentionally read-only: clicking a row hands the
 * id back to the parent, which opens the existing detail panel.
 */

export type PipelineSortField =
  | 'brand'
  | 'name'
  | 'status'
  | 'type'
  | 'shoot_date'
  | 'strategist'
  | 'videographer'
  | 'editor'
  | 'raws'
  | 'edits'
  | 'updated_at';

export type PipelineSortState = {
  field: PipelineSortField;
  dir: 'asc' | 'desc';
};

export type PipelineColumnKey =
  | 'brand'
  | 'name'
  | 'status'
  | 'type'
  | 'shoot_date'
  | 'strategist'
  | 'videographer'
  | 'editor'
  | 'raws'
  | 'edits'
  | 'updated_at';

const STATUS_TONE: Record<EditingProjectStatus, string> = {
  draft: 'border-nativz-border bg-surface-hover text-text-muted',
  in_review: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  approved: 'border-status-success/30 bg-status-success/10 text-status-success',
  scheduled: 'border-accent-text/30 bg-accent-text/10 text-accent-text',
  posted: 'border-nativz-border bg-surface-hover text-text-secondary',
  archived: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
};

const STATUS_RANK: Record<EditingProjectStatus, number> = {
  draft: 0,
  in_review: 1,
  approved: 2,
  scheduled: 3,
  posted: 4,
  archived: 5,
};

export function PipelineTable({
  projects,
  columns,
  sort,
  onSortChange,
  onOpen,
  emptyState,
}: {
  projects: EditingProject[];
  columns: PipelineColumnKey[];
  sort: PipelineSortState;
  onSortChange: (next: PipelineSortState) => void;
  onOpen: (id: string) => void;
  emptyState?: React.ReactNode;
}) {
  const sorted = useMemo(
    () => [...projects].sort((a, b) => sortProjectsBy(a, b, sort)),
    [projects, sort],
  );

  function toggleSort(field: PipelineSortField) {
    if (sort.field === field) {
      onSortChange({ field, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      onSortChange({ field, dir: 'asc' });
    }
  }

  if (projects.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <Table variant="card">
      <TableHeader>
        <TableRow>
          {columns.includes('brand') && (
            <TableHead>
              <SortHeader
                field="brand"
                sort={sort}
                onClick={() => toggleSort('brand')}
              >
                Brand
              </SortHeader>
            </TableHead>
          )}
          {columns.includes('name') && (
            <TableHead>
              <SortHeader
                field="name"
                sort={sort}
                onClick={() => toggleSort('name')}
              >
                Project
              </SortHeader>
            </TableHead>
          )}
          {columns.includes('status') && (
            <TableHead>
              <SortHeader
                field="status"
                sort={sort}
                onClick={() => toggleSort('status')}
              >
                Status
              </SortHeader>
            </TableHead>
          )}
          {columns.includes('type') && (
            <TableHead>
              <SortHeader
                field="type"
                sort={sort}
                onClick={() => toggleSort('type')}
              >
                Type
              </SortHeader>
            </TableHead>
          )}
          {columns.includes('shoot_date') && (
            <TableHead>
              <SortHeader
                field="shoot_date"
                sort={sort}
                onClick={() => toggleSort('shoot_date')}
              >
                Shoot date
              </SortHeader>
            </TableHead>
          )}
          {columns.includes('strategist') && (
            <TableHead>
              <SortHeader
                field="strategist"
                sort={sort}
                onClick={() => toggleSort('strategist')}
              >
                Strategist
              </SortHeader>
            </TableHead>
          )}
          {columns.includes('videographer') && (
            <TableHead>
              <SortHeader
                field="videographer"
                sort={sort}
                onClick={() => toggleSort('videographer')}
              >
                Videographer
              </SortHeader>
            </TableHead>
          )}
          {columns.includes('editor') && (
            <TableHead>
              <SortHeader
                field="editor"
                sort={sort}
                onClick={() => toggleSort('editor')}
              >
                Editor
              </SortHeader>
            </TableHead>
          )}
          {columns.includes('raws') && (
            <TableHead className="text-right">
              <SortHeader
                field="raws"
                sort={sort}
                onClick={() => toggleSort('raws')}
                align="right"
              >
                Raws
              </SortHeader>
            </TableHead>
          )}
          {columns.includes('edits') && (
            <TableHead className="text-right">
              <SortHeader
                field="edits"
                sort={sort}
                onClick={() => toggleSort('edits')}
                align="right"
              >
                Edits
              </SortHeader>
            </TableHead>
          )}
          {columns.includes('updated_at') && (
            <TableHead>
              <SortHeader
                field="updated_at"
                sort={sort}
                onClick={() => toggleSort('updated_at')}
              >
                Updated
              </SortHeader>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((p) => (
          <TableRow
            key={p.id}
            onClick={() => onOpen(p.id)}
            className="cursor-pointer hover:bg-surface-hover"
          >
            {columns.includes('brand') && (
              <TableCell>
                <div className="flex items-center gap-2 min-w-0">
                  <ClientLogo
                    src={p.client_logo_url}
                    name={p.client_name ?? 'Client'}
                    size="sm"
                  />
                  <span className="truncate text-sm text-text-primary">
                    {p.client_name ?? 'Unassigned'}
                  </span>
                </div>
              </TableCell>
            )}
            {columns.includes('name') && (
              <TableCell>
                <span className="text-sm font-medium text-text-primary">
                  {p.name}
                </span>
              </TableCell>
            )}
            {columns.includes('status') && (
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[p.status]}`}
                >
                  {EDITING_STATUS_LABEL[p.status]}
                </span>
              </TableCell>
            )}
            {columns.includes('type') && (
              <TableCell>
                <span className="text-xs text-text-secondary">
                  {EDITING_TYPE_LABEL[p.project_type]}
                </span>
              </TableCell>
            )}
            {columns.includes('shoot_date') && (
              <TableCell>
                <ShootDateCell shootDate={p.shoot_date} />
              </TableCell>
            )}
            {columns.includes('strategist') && (
              <TableCell>
                <RoleCell email={p.strategist_email} />
              </TableCell>
            )}
            {columns.includes('videographer') && (
              <TableCell>
                <RoleCell email={p.videographer_email} />
              </TableCell>
            )}
            {columns.includes('editor') && (
              <TableCell>
                <RoleCell email={p.assignee_email} />
              </TableCell>
            )}
            {columns.includes('raws') && (
              <TableCell className="text-right">
                <CountPill icon={<FileVideo size={11} />} value={p.raw_video_count} />
              </TableCell>
            )}
            {columns.includes('edits') && (
              <TableCell className="text-right">
                <CountPill icon={<Scissors size={11} />} value={p.video_count} />
              </TableCell>
            )}
            {columns.includes('updated_at') && (
              <TableCell>
                <span className="text-xs text-text-muted">
                  {describeAge(p.updated_at)}
                </span>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SortHeader({
  field,
  sort,
  onClick,
  align,
  children,
}: {
  field: PipelineSortField;
  sort: PipelineSortState;
  onClick: () => void;
  align?: 'right';
  children: React.ReactNode;
}) {
  const active = sort.field === field;
  const dir = active ? sort.dir : null;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/sort -mx-1 flex w-full items-center gap-1 rounded-md px-1 py-0.5 ${
        align === 'right' ? 'justify-end' : 'justify-start'
      } text-xs font-medium uppercase tracking-wider transition-colors ${
        active ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      <span>{children}</span>
      <Icon
        size={12}
        className={`shrink-0 transition-opacity ${
          active ? 'opacity-100 text-accent-text' : 'opacity-50 group-hover/sort:opacity-80'
        }`}
        aria-hidden
      />
    </button>
  );
}

function ShootDateCell({ shootDate }: { shootDate: string | null }) {
  if (!shootDate) {
    return <span className="text-xs text-text-muted">{NO_VALUE}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
      <Calendar size={11} className="text-text-muted" />
      {formatShootDate(shootDate)}
    </span>
  );
}

function RoleCell({ email }: { email: string | null }) {
  if (!email) return <span className="text-xs text-text-muted">{NO_VALUE}</span>;
  return (
    <span className="text-xs text-text-secondary" title={email}>
      {email.split('@')[0]}
    </span>
  );
}

function CountPill({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: number;
}) {
  const tone =
    value > 0
      ? 'bg-accent-surface text-accent-text'
      : 'bg-surface-hover text-text-muted';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${tone}`}
    >
      {icon}
      {value}
    </span>
  );
}

const NO_VALUE = '-';

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

function formatShootDate(ymd: string): string {
  // Expected YYYY-MM-DD; fall back to whatever we get if not.
  const [y, m, d] = ymd.split('-').map((s) => Number(s));
  if (!y || !m || !d) return ymd;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function sortProjectsBy(
  a: EditingProject,
  b: EditingProject,
  state: PipelineSortState,
): number {
  const sign = state.dir === 'asc' ? 1 : -1;

  // Sink rows with blank/null shoot date to the bottom regardless of
  // direction; same trick the review table uses for last_followup so a
  // videographer scanning by shoot day never has to wade past a wall
  // of dashes.
  if (state.field === 'shoot_date') {
    const aBlank = !a.shoot_date;
    const bBlank = !b.shoot_date;
    if (aBlank !== bBlank) return aBlank ? 1 : -1;
  }

  const cmp = (() => {
    switch (state.field) {
      case 'brand': {
        return (a.client_name ?? '').toLowerCase().localeCompare(
          (b.client_name ?? '').toLowerCase(),
        );
      }
      case 'name':
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      case 'status':
        return STATUS_RANK[a.status] - STATUS_RANK[b.status];
      case 'type':
        return a.project_type.localeCompare(b.project_type);
      case 'shoot_date': {
        const aT = a.shoot_date ? new Date(a.shoot_date).getTime() : 0;
        const bT = b.shoot_date ? new Date(b.shoot_date).getTime() : 0;
        return aT - bT;
      }
      case 'strategist':
        return (a.strategist_email ?? '~').localeCompare(b.strategist_email ?? '~');
      case 'videographer':
        return (a.videographer_email ?? '~').localeCompare(b.videographer_email ?? '~');
      case 'editor':
        return (a.assignee_email ?? '~').localeCompare(b.assignee_email ?? '~');
      case 'raws':
        return a.raw_video_count - b.raw_video_count;
      case 'edits':
        return a.video_count - b.video_count;
      case 'updated_at': {
        const aT = new Date(a.updated_at).getTime();
        const bT = new Date(b.updated_at).getTime();
        return aT - bT;
      }
    }
  })();

  // Tie-break on updated_at descending so the order stays deterministic
  // and rows don't visually swap on every re-render.
  if (cmp === 0) {
    const aT = new Date(a.updated_at).getTime();
    const bT = new Date(b.updated_at).getTime();
    return bT - aT;
  }

  return cmp * sign;
}
