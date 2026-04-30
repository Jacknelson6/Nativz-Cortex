'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  MessagesSquare,
  Pencil,
  RefreshCcw,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Trash2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ReviewContactsPanel } from '@/components/scheduler/review-contacts-panel';
import type {
  ReviewLinkRow,
  ReviewLinkStatus,
  ReviewProjectType,
} from '@/components/scheduler/review-board';

/**
 * `/review` workspace — two subpages on a single tab strip:
 *
 *   Content        → table of share links, one row per project
 *   Notifications  → per-brand POC list (who gets emailed, cadence)
 *
 * Same table for admin (brand-scoped at /review) and admin oversight
 * (/admin/share-links with `clientId={null}`); the only visual diff
 * is a Brand column when the table is unscoped.
 *
 * Columns:
 *   Project name (inline-editable, defaults to derived "May 2026
 *     Content Calendar"-style label) · Date sent · Status · Project
 *     type · Creatives (rendered as `approved / total`) · Last
 *     followup
 *
 * Right-click a row to archive it (soft-delete via `archived_at`); the
 * underlying drop and posts are untouched, the row just stops surfacing
 * in this table.
 *
 * The Last-followup column tracks days-since the most recent admin
 * "Send followup" press (or the initial send for fresh links). It
 * colors yellow at 4 days, red at 5+, and renders a Send button so
 * the admin can fire a generic check-in email without leaving the
 * page. Only renders when the link is awaiting action — approved /
 * abandoned / expired rows show "—" because there's nothing to chase.
 *
 * Status mapping (matches the agency's spoken vocabulary):
 *   - Ready for review (yellow) — sent, not yet finalized
 *   - Revising (blue) — client requested changes
 *   - Approved (green) — every post signed off
 *   - Abandoned (red) — admin marked dead OR link expired
 */

type StatusKey = ReviewLinkStatus;

const STATUS_META: Record<
  StatusKey,
  { label: string; tone: string; description: string }
> = {
  ready_for_review: {
    label: 'Ready for review',
    tone: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
    description: 'Calendar is shared, awaiting first approval.',
  },
  revising: {
    label: 'Revising',
    tone: 'border-accent-text/30 bg-accent-text/10 text-accent-text',
    description: 'Comments or change requests are open.',
  },
  approved: {
    label: 'Approved',
    tone: 'border-status-success/30 bg-status-success/10 text-status-success',
    description: 'Every post has been signed off.',
  },
  abandoned: {
    label: 'Abandoned',
    tone: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
    description: 'Marked dead by an admin. Posts will not ship.',
  },
  expired: {
    // Expired collapses into the same red pill as abandoned visually,
    // but keeps its own copy so we can debug expiry vs manual abandon.
    label: 'Abandoned',
    tone: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
    description: 'Link expired before review completed.',
  },
};

const PROJECT_TYPE_OPTIONS: {
  value: ReviewProjectType;
  label: string;
}[] = [
  { value: 'organic_content', label: 'Organic Content' },
  { value: 'social_ads', label: 'Social Ads' },
  { value: 'ctv_ads', label: 'CTV Ads' },
  { value: 'other', label: 'Other' },
];

function projectTypeLabel(row: ReviewLinkRow): string {
  if (!row.project_type) return '—';
  if (row.project_type === 'other') return row.project_type_other?.trim() || 'Other';
  return PROJECT_TYPE_OPTIONS.find((o) => o.value === row.project_type)?.label ?? '—';
}

export type SortKey = 'newest' | 'oldest' | 'progress';

/**
 * Column-driven sort. The Projects table now sorts by clicking the
 * column header rather than via a separate dropdown menu - same
 * pattern as Monday boards. `field` identifies which column owns
 * the sort, `dir` toggles ascending vs descending.
 *
 * Status order ranks the active states first (ready_for_review +
 * revising) and pushes terminal ones (approved / abandoned / expired)
 * to the bottom under ascending. That matches the gut intent of "show
 * me what still needs work" when the user clicks the Status header.
 *
 * Last-followup is tricky: for terminal links the column shows a
 * dash because there is nothing to chase. Those rows always sort to
 * the bottom regardless of direction so they don't poison the column.
 */
export type SortField =
  | 'brand'
  | 'name'
  | 'date_sent'
  | 'status'
  | 'project_type'
  | 'creatives'
  | 'last_followup';

export type SortDirection = 'asc' | 'desc';

export type SortState = { field: SortField; dir: SortDirection };

type Tab = 'content' | 'notifications';

interface ReviewTableProps {
  /** Active brand id. Pass `null` for cross-brand admin oversight. */
  clientId: string | null;
  brandName?: string;
  title?: string;
  description?: string;
  /** When true, prepend a Brand column. Defaults on for cross-brand. */
  showBrand?: boolean;
}

export function ReviewTable({
  clientId,
  brandName,
  title,
  description,
  showBrand,
}: ReviewTableProps) {
  const showBrandColumn = showBrand ?? clientId === null;
  const [tab, setTab] = useState<Tab>('content');
  const [links, setLinks] = useState<ReviewLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortState>({ field: 'date_sent', dir: 'desc' });

  async function load(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const url = clientId
        ? `/api/calendar/review?clientId=${encodeURIComponent(clientId)}`
        : '/api/calendar/review';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load share links');
      const data = (await res.json()) as { links: ReviewLinkRow[] };
      setLinks(data.links ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load share links');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const sorted = useMemo(
    () => [...links].sort((a, b) => sortLinksBy(a, b, sort)),
    [links, sort],
  );

  const total = links.length;
  const subtitle =
    description ??
    (brandName
      ? `${brandName} · ${total} share link${total === 1 ? '' : 's'}`
      : `All brands · ${total} share link${total === 1 ? '' : 's'}`);

  function patchLink(id: string, patch: Partial<ReviewLinkRow>) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  return (
    <TooltipProvider>
      <div className="cortex-page-gutter mx-auto max-w-6xl space-y-5">
        <header className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text-primary">{title ?? 'Review'}</h1>
            <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
          </div>
          {tab === 'content' && (
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
            </div>
          )}
        </header>

        <TabStrip active={tab} onChange={setTab} />

        {tab === 'content' ? (
          loading ? (
            <ReviewTableSkeleton />
          ) : links.length === 0 ? (
            <EmptyState brandName={brandName} />
          ) : (
            <ReviewTableCard
              rows={sorted}
              showBrand={showBrandColumn}
              onPatchLink={patchLink}
              sort={sort}
              onSortChange={setSort}
            />
          )
        ) : clientId ? (
          <ReviewContactsPanel clientId={clientId} brandName={brandName} />
        ) : (
          <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center text-sm text-text-muted">
            Pick a brand to manage notification contacts.
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function TabStrip({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const tabs: { key: Tab; label: string; icon: typeof FileText }[] = [
    { key: 'content', label: 'Content', icon: FileText },
    { key: 'notifications', label: 'Notifications', icon: Bell },
  ];
  return (
    <nav className="flex items-center gap-1 border-b border-nativz-border" aria-label="Review sections">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              isActive
                ? 'border-accent-text text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="size-3.5" />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Column keys the parent can hide on a per-tab basis. We deliberately
 * skip `name` (always rendered) and `brand` (already gated by the
 * `showBrand` flag) so callers can't accidentally produce an empty
 * row.
 */
export type ReviewHideableColumn =
  | 'date_sent'
  | 'status'
  | 'project_type'
  | 'creatives'
  | 'last_followup';

interface ReviewTableCardProps {
  rows: ReviewLinkRow[];
  showBrand?: boolean;
  onPatchLink: (id: string, patch: Partial<ReviewLinkRow>) => void;
  /**
   * Optional archive handler. When provided, right-clicking a row
   * surfaces an "Archive" item that calls this with the share-link
   * id. The parent owns optimistic removal from local state.
   */
  onArchiveLink?: (id: string) => void;
  /** Override the card's internal title block. Defaults to "Content". */
  title?: string;
  /**
   * Optional column-sort state. When supplied, the header row renders
   * clickable sort buttons with directional arrows (Monday-style).
   * The parent owns the state so multiple cards stay in sync and so
   * the toggle survives cross-tab navigation.
   */
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  /**
   * Hide individual columns on a per-tab basis. Used by the project-
   * type sub-tabs (Organic Social / Paid Social / CTV / Other) to
   * drop the now-redundant "Project type" column without forking the
   * whole table primitive.
   */
  hideColumns?: ReadonlyArray<ReviewHideableColumn>;
}

export function ReviewTableCard({
  rows,
  showBrand = false,
  onPatchLink,
  onArchiveLink,
  title,
  sort,
  onSortChange,
  hideColumns,
}: ReviewTableCardProps) {
  const hidden = new Set<ReviewHideableColumn>(hideColumns ?? []);
  const showDateSent = !hidden.has('date_sent');
  const showStatus = !hidden.has('status');
  const showProjectType = !hidden.has('project_type');
  const showCreatives = !hidden.has('creatives');
  const showLastFollowup = !hidden.has('last_followup');
  // Chrome row colSpan tracks how many rendered columns there are so
  // the title bar always stretches the full width.
  const visibleDataColumns =
    (showBrand ? 1 : 0) +
    1 /* name */ +
    (showDateSent ? 1 : 0) +
    (showStatus ? 1 : 0) +
    (showProjectType ? 1 : 0) +
    (showCreatives ? 1 : 0) +
    (showLastFollowup ? 1 : 0);
  // When the parent doesn't pass a sort handler we render plain
  // header labels (read-only contexts, e.g. portal previews).
  const sortable = !!onSortChange;
  function handleSort(field: SortField) {
    if (!onSortChange) return;
    if (sort?.field === field) {
      onSortChange({ field, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      // First click on a new column defaults to descending so most
      // useful values (newest dates, fullest creatives, longest
      // followup gaps) surface at the top.
      onSortChange({ field, dir: 'desc' });
    }
  }
  return (
    <Table variant="card">
      <thead>
        <tr>
          <th
            colSpan={visibleDataColumns}
            className="border-b border-nativz-border px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 text-left">
                <div className="text-sm font-semibold text-text-primary">
                  {title ?? 'Content'}
                </div>
                <div className="mt-0.5 text-xs text-text-muted">
                  {rows.length} project{rows.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          </th>
        </tr>
      </thead>
      <TableHeader>
        <TableRow>
          {showBrand && (
            <TableHead className="whitespace-nowrap px-2.5">
              <SortableHeader
                field="brand"
                sort={sort}
                onSortChange={sortable ? () => handleSort('brand') : undefined}
              >
                Brand
              </SortableHeader>
            </TableHead>
          )}
          <TableHead className="whitespace-nowrap px-2.5">
            <SortableHeader
              field="name"
              sort={sort}
              onSortChange={sortable ? () => handleSort('name') : undefined}
            >
              Project name
            </SortableHeader>
          </TableHead>
          {showDateSent && (
            <TableHead className="whitespace-nowrap px-2.5 text-center">
              <SortableHeader
                field="date_sent"
                sort={sort}
                align="center"
                onSortChange={sortable ? () => handleSort('date_sent') : undefined}
              >
                Date sent
              </SortableHeader>
            </TableHead>
          )}
          {showStatus && (
            <TableHead className="whitespace-nowrap px-2.5 text-center">
              <SortableHeader
                field="status"
                sort={sort}
                align="center"
                onSortChange={sortable ? () => handleSort('status') : undefined}
              >
                Status
              </SortableHeader>
            </TableHead>
          )}
          {showProjectType && (
            <TableHead className="whitespace-nowrap px-2.5 text-center">
              <SortableHeader
                field="project_type"
                sort={sort}
                align="center"
                onSortChange={sortable ? () => handleSort('project_type') : undefined}
              >
                Project type
              </SortableHeader>
            </TableHead>
          )}
          {showCreatives && (
            <TableHead className="whitespace-nowrap px-2.5 text-center">
              <SortableHeader
                field="creatives"
                sort={sort}
                align="center"
                onSortChange={sortable ? () => handleSort('creatives') : undefined}
              >
                Creatives
              </SortableHeader>
            </TableHead>
          )}
          {showLastFollowup && (
            <TableHead className="whitespace-nowrap px-2.5 text-center">
              <SortableHeader
                field="last_followup"
                sort={sort}
                align="center"
                onSortChange={sortable ? () => handleSort('last_followup') : undefined}
              >
                Last followup
              </SortableHeader>
            </TableHead>
          )}
          <TableHead className="w-8 px-2" aria-label="Open" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((link) => (
          <ReviewTableRow
            key={link.id}
            link={link}
            showBrand={showBrand}
            showDateSent={showDateSent}
            showStatus={showStatus}
            showProjectType={showProjectType}
            showCreatives={showCreatives}
            showLastFollowup={showLastFollowup}
            onPatch={(patch) => onPatchLink(link.id, patch)}
            onArchive={onArchiveLink ? () => onArchiveLink(link.id) : undefined}
          />
        ))}
      </TableBody>
    </Table>
  );
}

interface ReviewTableRowProps {
  link: ReviewLinkRow;
  showBrand?: boolean;
  showDateSent?: boolean;
  showStatus?: boolean;
  showProjectType?: boolean;
  showCreatives?: boolean;
  showLastFollowup?: boolean;
  onPatch: (patch: Partial<ReviewLinkRow>) => void;
  /** Right-click "Archive" handler. Hides the menu item when omitted. */
  onArchive?: () => void;
}

function ReviewTableRow({
  link,
  showBrand = false,
  showDateSent = true,
  showStatus = true,
  showProjectType = true,
  showCreatives = true,
  showLastFollowup = true,
  onPatch,
  onArchive,
}: ReviewTableRowProps) {
  const dim = link.status === 'abandoned' || link.status === 'expired';

  function openReview() {
    window.open(`/c/${link.token}`, '_blank', 'noopener,noreferrer');
  }

  const rowBody = (
    <TableRow
      onClick={openReview}
      className={`cursor-pointer ${dim ? 'opacity-70' : ''}`}
    >
      {showBrand && (
        <TableCell className="whitespace-nowrap px-2.5">
          <span className="text-sm text-text-secondary">{link.client_name ?? '—'}</span>
        </TableCell>
      )}
      <TableCell className="px-2.5" onClick={(e) => e.stopPropagation()}>
        <ProjectNameCell link={link} onPatch={onPatch} />
      </TableCell>
      {showDateSent && (
        <TableCell className="whitespace-nowrap px-2.5 text-center">
          <span className="text-sm text-text-secondary tabular-nums">
            {formatShortDate(link.created_at)}
          </span>
        </TableCell>
      )}
      {showStatus && (
        <TableCell className="whitespace-nowrap px-2.5 text-center">
          <div className="flex justify-center">
            <StatusPill status={link.status} />
          </div>
        </TableCell>
      )}
      {showProjectType && (
        <TableCell
          className="whitespace-nowrap px-2.5 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center">
            <ProjectTypeCell link={link} onPatch={onPatch} />
          </div>
        </TableCell>
      )}
      {showCreatives && (
        <TableCell className="whitespace-nowrap px-2.5 text-center">
          <div className="flex justify-center">
            <ApprovedCount link={link} />
          </div>
        </TableCell>
      )}
      {showLastFollowup && (
        <TableCell
          className="whitespace-nowrap px-2.5 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center">
            <FollowupCell link={link} onPatch={onPatch} />
          </div>
        </TableCell>
      )}
      <TableCell className="w-8 whitespace-nowrap px-2 text-right text-text-tertiary">
        <ChevronRight className="size-4 transition-transform group-hover/row:translate-x-0.5 group-hover/row:text-text-secondary" />
      </TableCell>
    </TableRow>
  );

  // Without an archive handler, render the row directly. Wrapping in
  // ContextMenu adds a Radix portal per row, which is wasted work for
  // surfaces that don't support archive (e.g. read-only viewer view).
  if (!onArchive) return rowBody;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{rowBody}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem
          onSelect={onArchive}
          className="text-status-danger focus:text-status-danger"
        >
          <Trash2 size={14} />
          Archive
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Approved-creatives column. Renders "n / total" with the numerator
 *  tinted by the underlying state (warning if there are open changes,
 *  success when everything's signed off). */
function ApprovedCount({ link }: { link: ReviewLinkRow }) {
  if (link.post_count === 0) {
    return <span className="text-sm text-text-muted">—</span>;
  }
  const tone =
    link.changes_count > 0
      ? 'text-status-warning'
      : link.approved_count === link.post_count
        ? 'text-status-success'
        : 'text-text-secondary';
  return (
    <span className={`text-sm tabular-nums ${tone}`}>
      {link.approved_count} / {link.post_count}
    </span>
  );
}

/**
 * Inline-edit project name. Shows the current name with a pencil icon
 * that turns into an editable input on click. Empty string reverts to
 * the derived "May 2026 Content Calendar" name.
 */
function ProjectNameCell({
  link,
  onPatch,
}: {
  link: ReviewLinkRow;
  onPatch: (patch: Partial<ReviewLinkRow>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(link.name ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = link.name?.trim() || derivedName(link.drop_start, link.drop_end);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function save() {
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    setEditing(false);
    if (next === (link.name ?? null)) return;
    // Optimistic.
    onPatch({ name: next });
    try {
      const res = await fetch(`/api/calendar/review/${link.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) throw new Error('Rename failed');
    } catch (err) {
      onPatch({ name: link.name ?? null });
      toast.error(err instanceof Error ? err.message : 'Rename failed');
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') {
            setDraft(link.name ?? '');
            setEditing(false);
          }
        }}
        className="w-full rounded-md border border-accent-text/40 bg-background px-2 py-1 text-sm font-medium text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-text"
        placeholder="Project name"
      />
    );
  }

  // Truncate at 20 chars so a long name can't push the table into
  // horizontal scroll. Hover reveals the full name via tooltip.
  const TRUNCATE_AT = 20;
  const truncated = displayName.length > TRUNCATE_AT;
  const visibleName = truncated
    ? `${displayName.slice(0, TRUNCATE_AT).trimEnd()}…`
    : displayName;

  const trigger = (
    <button
      type="button"
      onClick={() => {
        setDraft(link.name ?? '');
        setEditing(true);
      }}
      className="group/name -mx-1 flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-surface-hover"
      aria-label={`Rename ${displayName}`}
    >
      <span className="whitespace-nowrap font-medium text-text-primary">{visibleName}</span>
      <Pencil className="size-3 shrink-0 text-text-muted opacity-0 transition-opacity group-hover/name:opacity-100" />
    </button>
  );

  if (!truncated) return trigger;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <span className="text-text-primary">{displayName}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Project-type chip with a dropdown to change the type. Closed state
 * is just a badge so the row reads light; open state uses the same
 * dropdown menu primitive as the sort menu.
 */
function ProjectTypeCell({
  link,
  onPatch,
}: {
  link: ReviewLinkRow;
  onPatch: (patch: Partial<ReviewLinkRow>) => void;
}) {
  const label = projectTypeLabel(link);
  const isUnset = !link.project_type;

  async function setType(value: ReviewProjectType | null) {
    onPatch({
      project_type: value,
      // Clear the freeform other-label when switching away from "other".
      project_type_other: value === 'other' ? link.project_type_other : null,
    });
    try {
      const res = await fetch(`/api/calendar/review/${link.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project_type: value }),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            isUnset
              ? 'border-dashed border-nativz-border text-text-muted hover:bg-surface-hover'
              : 'border-nativz-border text-text-secondary hover:bg-surface-hover'
          }`}
        >
          {label}
          <ChevronDown size={11} className="opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuRadioGroup
          value={link.project_type ?? ''}
          onValueChange={(v) =>
            void setType((v || null) as ReviewProjectType | null)
          }
        >
          {PROJECT_TYPE_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {!isUnset && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void setType(null)}>
              Clear type
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Last-followup column. Two responsibilities:
 *   1. Render a days-since indicator with a colored dot — green when
 *      we're within polite-nudge range, yellow once it's getting old,
 *      red when it's been long enough that the client has probably
 *      forgotten the calendar exists. Only fires for awaiting-action
 *      states; approved / abandoned / expired rows show "—".
 *   2. Provide a one-click "Send followup" button that POSTs to the
 *      admin endpoint, emails every notifications-enabled review POC,
 *      and resets the clock. Optimistically patches the row so the
 *      indicator drops back to green without a refetch.
 */
function FollowupCell({
  link,
  onPatch,
}: {
  link: ReviewLinkRow;
  onPatch: (patch: Partial<ReviewLinkRow>) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Awaiting action = ready_for_review or revising. Once the calendar's
  // approved or dead, chasing the client doesn't make sense, so the
  // indicator + button collapse to a simple em-dash.
  const awaitingAction =
    link.status === 'ready_for_review' || link.status === 'revising';

  if (!awaitingAction) {
    return <span className="text-sm text-text-muted">—</span>;
  }

  const stamp = link.last_followup_at;
  const days = stamp ? daysSince(stamp) : null;
  const tone = followupTone(days);
  const label = formatFollowupLabel(days);

  const tooltipBody =
    days === null
      ? 'No followups sent yet.'
      : `${days === 0 ? 'Less than a day' : `${days} day${days === 1 ? '' : 's'}`} since the last nudge.${
          link.followup_count > 0
            ? ` ${link.followup_count} followup${link.followup_count === 1 ? '' : 's'} sent.`
            : ''
        }`;

  return (
    <div className="inline-flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${tone.className}`}
          >
            <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="w-56">
          <div className="font-medium text-text-primary">Last followup</div>
          <div className="mt-0.5 text-text-muted">{tooltipBody}</div>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Send followup"
          >
            <Send className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-text-primary">Preview &amp; send followup</div>
        </TooltipContent>
      </Tooltip>
      {dialogOpen && (
        <FollowupDraftDialog
          link={link}
          onClose={() => setDialogOpen(false)}
          onSent={(data) => {
            onPatch({
              last_followup_at: data.last_followup_at,
              followup_count: data.followup_count,
            });
          }}
        />
      )}
    </div>
  );
}

interface FollowupDraft {
  subject: string;
  message: string;
  recipients: { email: string; name: string | null }[];
  client_name: string;
}

interface FollowupSendResult {
  last_followup_at: string;
  followup_count: number;
  recipients_count: number;
}

/**
 * Preview + edit the auto-composed nudge before it goes out. Opens
 * when the admin clicks the Send button. Pulls the default subject
 * and body from `GET /api/calendar/share/[token]/followup`, lets the
 * admin tweak both, then POSTs the overrides on confirm.
 */
function FollowupDraftDialog({
  link,
  onClose,
  onSent,
}: {
  link: ReviewLinkRow;
  onClose: () => void;
  onSent: (data: FollowupSendResult) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<FollowupDraft | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/calendar/share/${link.token}/followup`);
        const data = (await res.json().catch(() => ({}))) as
          | (FollowupDraft & { error?: never })
          | { error: string };
        if (cancelled) return;
        if (!res.ok || 'error' in data) {
          throw new Error(('error' in data && data.error) || 'Could not load draft');
        }
        setDraft(data);
        setSubject(data.subject);
        setMessage(data.message);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load draft');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [link.token]);

  async function send() {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/calendar/share/${link.token}/followup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<FollowupSendResult> & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Followup failed');

      const result: FollowupSendResult = {
        last_followup_at: data.last_followup_at ?? new Date().toISOString(),
        followup_count: data.followup_count ?? (link.followup_count ?? 0) + 1,
        recipients_count: data.recipients_count ?? draft?.recipients.length ?? 0,
      };
      onSent(result);
      const recipientWord = result.recipients_count === 1 ? 'contact' : 'contacts';
      toast.success(
        result.recipients_count
          ? `Followup sent to ${result.recipients_count} ${recipientWord}`
          : 'Followup sent',
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Followup failed');
    } finally {
      setSending(false);
    }
  }

  const recipientsLine = draft?.recipients.length
    ? draft.recipients
        .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
        .join(', ')
    : '';

  const canSend = !sending && !loading && !loadError && subject.trim().length > 0 && message.trim().length > 0;

  return (
    <Dialog open onClose={onClose} title="Send followup email" maxWidth="xl">
      {loading ? (
        <div className="flex items-center justify-center py-10 text-text-muted">
          <Loader2 className="size-4 animate-spin" />
          <span className="ml-2 text-sm">Loading draft…</span>
        </div>
      ) : loadError ? (
        <div className="space-y-3">
          <p className="text-sm text-status-danger">{loadError}</p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
              To
            </div>
            <div className="mt-1 text-sm text-text-secondary">
              {recipientsLine || 'No recipients'}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Subject
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 block w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-text focus:outline-none focus:ring-1 focus:ring-accent-text"
              maxLength={200}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Message
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="mt-1 block w-full resize-y rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent-text focus:outline-none focus:ring-1 focus:ring-accent-text"
              maxLength={5000}
            />
            <span className="mt-1 block text-xs text-text-muted">
              Blank lines start a new paragraph. The branded layout and the
              &ldquo;Open the calendar&rdquo; button are added automatically.
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={send} disabled={!canSend}>
              {sending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Whole-day delta between `iso` and now. Negatives clamp to 0 (clock
 *  skew or future timestamps shouldn't blow up the indicator). */
function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  const ms = Date.now() - then;
  if (ms <= 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/** Color cascade matches Jack's spec: green ≤3 days, yellow at 4,
 *  red ≥5. Null (no stamp) reads as a fresh send and stays green. */
function followupTone(days: number | null): { className: string; dot: string } {
  if (days === null || days <= 3) {
    return {
      className:
        'border-status-success/30 bg-status-success/10 text-status-success',
      dot: 'bg-status-success',
    };
  }
  if (days === 4) {
    return {
      className:
        'border-status-warning/30 bg-status-warning/10 text-status-warning',
      dot: 'bg-status-warning',
    };
  }
  return {
    className:
      'border-status-danger/30 bg-status-danger/10 text-status-danger',
    dot: 'bg-status-danger',
  };
}

function formatFollowupLabel(days: number | null): string {
  if (days === null) return 'New';
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

/** Status pill, colored badge with a tooltip explaining the stage. */
function StatusPill({ status }: { status: StatusKey }) {
  const meta = STATUS_META[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.tone}`}
        >
          {meta.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="w-56">
        <div className="font-medium text-text-primary">{meta.label}</div>
        <div className="mt-0.5 text-text-muted">{meta.description}</div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Clickable column-header label. Renders the column name plus a small
 * directional arrow (or a neutral up/down indicator when the column
 * isn't the active sort axis). The whole header turns into a button
 * so the click target spans the full cell.
 *
 * Visual behavior:
 *   - Active asc  -> arrow up, text in primary tone
 *   - Active desc -> arrow down, text in primary tone
 *   - Inactive    -> faint up/down indicator, muted text
 *
 * When `onSortChange` is omitted (read-only contexts) the header
 * renders as plain static text - no button, no hover affordance.
 */
function SortableHeader({
  field,
  sort,
  onSortChange,
  align,
  children,
}: {
  field: SortField;
  sort?: SortState;
  onSortChange?: () => void;
  align?: 'left' | 'center';
  children: React.ReactNode;
}) {
  if (!onSortChange) return <>{children}</>;
  const active = sort?.field === field;
  const dir = active ? sort?.dir : null;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  const justify = align === 'center' ? 'justify-center' : 'justify-start';
  // `aria-sort` belongs on the parent <th>, not the button (a11y
  // lint catches `aria-sort` on a button). Screen readers still
  // pick up the active state through the button's accessible name
  // ("Project name, descending") via the title attribute.
  const ariaLabel = `${typeof children === 'string' ? children : 'column'}, ${
    active ? (dir === 'asc' ? 'sorted ascending' : 'sorted descending') : 'click to sort'
  }`;
  return (
    <button
      type="button"
      onClick={onSortChange}
      title={ariaLabel}
      className={`group/sort -mx-1 flex w-full items-center gap-1 rounded-md px-1 py-0.5 ${justify} text-xs font-medium uppercase tracking-wider transition-colors ${
        active
          ? 'text-text-primary'
          : 'text-text-muted hover:text-text-secondary'
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

function ReviewTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="border-b border-nativz-border px-5 py-4">
        <div className="h-4 w-32 animate-pulse rounded bg-nativz-border" />
      </div>
      <div className="divide-y divide-nativz-border/60">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="size-8 animate-pulse rounded-md bg-nativz-border" />
            <div className="h-4 w-40 animate-pulse rounded bg-nativz-border" />
            <div className="ml-auto h-6 w-24 animate-pulse rounded bg-nativz-border" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ brandName }: { brandName?: string }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
      <MessagesSquare className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
      <p className="text-sm text-text-secondary">No share links yet.</p>
      <p className="mt-1 text-xs text-text-muted">
        {brandName
          ? `When your team sends ${brandName} a calendar for review, it’ll show up here.`
          : 'When your team sends a calendar for review, it’ll show up here.'}
      </p>
    </div>
  );
}

export function sortLinks(a: ReviewLinkRow, b: ReviewLinkRow, sort: SortKey): number {
  if (sort === 'progress') {
    const order: Record<StatusKey, number> = {
      ready_for_review: 0,
      revising: 1,
      approved: 2,
      abandoned: 3,
      expired: 3,
    };
    return order[b.status] - order[a.status];
  }
  const aT = new Date(a.created_at ?? a.drop_start ?? 0).getTime();
  const bT = new Date(b.created_at ?? b.drop_start ?? 0).getTime();
  return sort === 'newest' ? bT - aT : aT - bT;
}

/** Status ordering shared by `sortLinksBy` and the legacy `sortLinks`
 *  so the click-to-sort UI matches the dropdown's "progress" axis. */
const STATUS_RANK: Record<StatusKey, number> = {
  ready_for_review: 0,
  revising: 1,
  approved: 2,
  abandoned: 3,
  expired: 3,
};

/**
 * Column-aware comparator. Used by `ReviewTableCard` when the parent
 * passes a `sort: SortState`. Each branch falls back to date_sent on a
 * tie so the row order stays deterministic and the user doesn't see
 * adjacent rows visually swap on every re-render.
 *
 * `last_followup`: rows whose `last_followup_at` is null (terminal
 * links - approved / abandoned / expired) always sink to the bottom,
 * regardless of direction. Otherwise sorting them by null-as-zero
 * dumps a wall of dashes at the top whenever the user clicks asc.
 *
 * `creatives`: sorted by approval ratio (`approved_count / post_count`).
 * Empty-creative rows (post_count === 0) sink to the bottom.
 */
export function sortLinksBy(
  a: ReviewLinkRow,
  b: ReviewLinkRow,
  state: SortState,
): number {
  const sign = state.dir === 'asc' ? 1 : -1;

  // Some columns sink "blank" rows to the bottom regardless of
  // direction (terminal followups, empty-creative rows). These run
  // first and short-circuit before sign multiplication.
  if (state.field === 'creatives') {
    const aEmpty = a.post_count === 0;
    const bEmpty = b.post_count === 0;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
  }
  if (state.field === 'last_followup') {
    const aBlank = !a.last_followup_at;
    const bBlank = !b.last_followup_at;
    if (aBlank !== bBlank) return aBlank ? 1 : -1;
  }

  const cmp = (() => {
    switch (state.field) {
      case 'brand': {
        const av = (a.client_name ?? '').toLowerCase();
        const bv = (b.client_name ?? '').toLowerCase();
        return av.localeCompare(bv);
      }
      case 'name': {
        const aName = (a.name?.trim() || derivedName(a.drop_start, a.drop_end)).toLowerCase();
        const bName = (b.name?.trim() || derivedName(b.drop_start, b.drop_end)).toLowerCase();
        return aName.localeCompare(bName);
      }
      case 'date_sent': {
        const aT = new Date(a.created_at ?? a.drop_start ?? 0).getTime();
        const bT = new Date(b.created_at ?? b.drop_start ?? 0).getTime();
        return aT - bT;
      }
      case 'status':
        return STATUS_RANK[a.status] - STATUS_RANK[b.status];
      case 'project_type': {
        const av = projectTypeLabel(a).toLowerCase();
        const bv = projectTypeLabel(b).toLowerCase();
        return av.localeCompare(bv);
      }
      case 'creatives': {
        const aR = a.post_count === 0 ? 0 : a.approved_count / a.post_count;
        const bR = b.post_count === 0 ? 0 : b.approved_count / b.post_count;
        return aR - bR;
      }
      case 'last_followup': {
        const aT = new Date(a.last_followup_at ?? 0).getTime();
        const bT = new Date(b.last_followup_at ?? 0).getTime();
        return aT - bT;
      }
    }
  })();

  if (cmp !== 0) return cmp * sign;

  // Tie-breaker: most recently sent at the top so reorder feels stable.
  const aT = new Date(a.created_at ?? a.drop_start ?? 0).getTime();
  const bT = new Date(b.created_at ?? b.drop_start ?? 0).getTime();
  return bT - aT;
}

/**
 * Derives a calendar name from the drop window. Content calendars are
 * always named for the **latter** month — an Apr–May drop is the
 * "May 2026 Content Calendar" because that's the month being shipped.
 *
 * Title Case here matches the agency's project-naming convention in
 * client-facing copy, even though the rest of the UI is sentence case.
 */
function derivedName(start: string | null, end: string | null): string {
  const ref = end ?? start;
  if (!ref) return 'Content Calendar';
  const d = new Date(ref);
  if (Number.isNaN(d.getTime())) return 'Content Calendar';
  const month = d.toLocaleString('default', { month: 'long' });
  return `${month} ${d.getFullYear()} Content Calendar`;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

