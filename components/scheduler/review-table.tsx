'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  MessagesSquare,
  Pencil,
  RefreshCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
 *     type · Total creatives · Approved creatives · Expiration
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

type SortKey = 'newest' | 'oldest' | 'progress';
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
  const [sort, setSort] = useState<SortKey>('newest');

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
    () => [...links].sort((a, b) => sortLinks(a, b, sort)),
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
              <SortMenu sort={sort} onChange={setSort} />
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

interface ReviewTableCardProps {
  rows: ReviewLinkRow[];
  showBrand?: boolean;
  onPatchLink: (id: string, patch: Partial<ReviewLinkRow>) => void;
}

function ReviewTableCard({ rows, showBrand = false, onPatchLink }: ReviewTableCardProps) {
  return (
    <Table variant="card">
      <thead>
        <tr>
          <th
            colSpan={(showBrand ? 1 : 0) + 7}
            className="border-b border-nativz-border px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 text-left">
                <div className="text-sm font-semibold text-text-primary">Content</div>
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
          {showBrand && <TableHead>Brand</TableHead>}
          <TableHead>Project name</TableHead>
          <TableHead>Date sent</TableHead>
          <TableHead className="text-center">Status</TableHead>
          <TableHead>Project type</TableHead>
          <TableHead className="text-right">Total creatives</TableHead>
          <TableHead className="text-right">Approved</TableHead>
          <TableHead>Expiration</TableHead>
          <TableHead className="w-10" aria-label="Open" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((link) => (
          <ReviewTableRow
            key={link.id}
            link={link}
            showBrand={showBrand}
            onPatch={(patch) => onPatchLink(link.id, patch)}
          />
        ))}
      </TableBody>
    </Table>
  );
}

interface ReviewTableRowProps {
  link: ReviewLinkRow;
  showBrand?: boolean;
  onPatch: (patch: Partial<ReviewLinkRow>) => void;
}

function ReviewTableRow({ link, showBrand = false, onPatch }: ReviewTableRowProps) {
  const dim = link.status === 'abandoned' || link.status === 'expired';

  function openReview() {
    window.open(`/c/${link.token}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <TableRow
      onClick={openReview}
      className={`cursor-pointer ${dim ? 'opacity-70' : ''}`}
    >
      {showBrand && (
        <TableCell>
          <span className="text-sm text-text-secondary">{link.client_name ?? '—'}</span>
        </TableCell>
      )}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-nativz-border bg-background text-text-muted">
            <CalendarDays className="size-3.5" />
          </span>
          <ProjectNameCell link={link} onPatch={onPatch} />
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm text-text-secondary tabular-nums">
          {formatShortDate(link.created_at)}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <div className="flex justify-center">
          <StatusPill status={link.status} />
        </div>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <ProjectTypeCell link={link} onPatch={onPatch} />
      </TableCell>
      <TableCell className="text-right">
        <span className="text-sm text-text-secondary tabular-nums">{link.post_count}</span>
      </TableCell>
      <TableCell className="text-right">
        <ApprovedCount link={link} />
      </TableCell>
      <TableCell>
        <ExpirationCell expiresAt={link.expires_at} status={link.status} />
      </TableCell>
      <TableCell className="w-10 text-right text-text-muted">
        <ChevronRight className="size-4" />
      </TableCell>
    </TableRow>
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
  const lastSeen = link.last_viewed_at ? formatRelative(link.last_viewed_at) : null;

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

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => {
          setDraft(link.name ?? '');
          setEditing(true);
        }}
        className="group/name -mx-1 flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-surface-hover"
        aria-label={`Rename ${displayName}`}
      >
        <span className="truncate font-medium text-text-primary">{displayName}</span>
        <Pencil className="size-3 shrink-0 text-text-muted opacity-0 transition-opacity group-hover/name:opacity-100" />
      </button>
      <div className="text-xs text-text-muted tabular-nums">
        {lastSeen ? `Last viewed ${lastSeen}` : 'Not yet viewed'}
      </div>
    </div>
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

function ExpirationCell({
  expiresAt,
  status,
}: {
  expiresAt: string | null;
  status: StatusKey;
}) {
  if (!expiresAt) return <span className="text-sm text-text-muted">—</span>;
  // The API already classifies expired/abandoned at fetch time, so we
  // trust `status` rather than recomputing against a moving clock here
  // (which would also be an impure call during render).
  if (status === 'expired') {
    return <span className="text-sm text-status-danger">Expired</span>;
  }
  return (
    <span className="text-sm text-text-secondary tabular-nums">
      {formatShortDate(expiresAt)}
    </span>
  );
}

/** Status pill — colored badge with a tooltip explaining the stage. */
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

function SortMenu({ sort, onChange }: { sort: SortKey; onChange: (s: SortKey) => void }) {
  const label =
    sort === 'newest' ? 'Sort by date' : sort === 'oldest' ? 'Oldest first' : 'Most progress';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <span>{label}</span>
          <ChevronDown size={12} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onChange(v as SortKey)}>
          <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="progress">Most progress</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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

function sortLinks(a: ReviewLinkRow, b: ReviewLinkRow, sort: SortKey): number {
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

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < hr) return `${Math.max(1, Math.round(diff / min))}m ago`;
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}
