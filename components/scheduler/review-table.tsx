'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowUpDown,
  CheckIcon,
  ChevronDown,
  Eye,
  ExternalLink,
  MessagesSquare,
  RefreshCcw,
  Send,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ReviewLinkRow } from '@/components/scheduler/review-board';

/**
 * Viewer review surface — table layout (replaces the bento grid for the
 * client side at /review). Built on the shared `<Table variant="card">`
 * primitive so it shares the rounded surface, hover/selection states,
 * and rhythm with any future card-tables across the app.
 *
 * Always brand-scoped: the page that mounts this passes `clientId` from
 * the active brand pill, so the table never mixes brands. Admin-only
 * cross-brand oversight stays on `/admin/share-links`.
 *
 * Stage track derives from existing aggregates returned by
 * `/api/calendar/review` — no schema changes:
 *
 *   Sent  →  Viewed  →  Reviewing  →  Approved
 *
 * Selection model: rows can be checked individually or via the header
 * "select all" box. The selection drives a bulk-action bar that opens
 * the chosen reviews in new tabs at once. The actions stop short of
 * destructive ops on purpose — this is a viewer surface, not admin.
 */

type ReviewStage = 'sent' | 'viewed' | 'reviewing' | 'approved';

const STAGES: { key: ReviewStage; label: string; icon: typeof CheckIcon }[] = [
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'viewed', label: 'Viewed', icon: Eye },
  { key: 'reviewing', label: 'Reviewing', icon: MessagesSquare },
  { key: 'approved', label: 'Approved', icon: CheckIcon },
];

const stageIndex = (s: ReviewStage) => STAGES.findIndex((x) => x.key === s);

/** Resolve which stage a link is currently in. Walks the aggregates the
 *  API already computes, so the table mirrors what the calendar shows
 *  without re-querying comments. */
function currentStage(link: ReviewLinkRow): ReviewStage {
  if (link.status === 'approved') return 'approved';
  if (link.status === 'revising') return 'reviewing';
  if (link.changes_count > 0) return 'reviewing';
  if (link.last_viewed_at) return 'viewed';
  return 'sent';
}

type SortKey = 'newest' | 'oldest' | 'progress';

interface ReviewTableProps {
  /** Active brand id. Pass `null` to render unscoped (cross-brand
   *  admin oversight at `/admin/share-links`). */
  clientId: string | null;
  /** Optional brand name for header copy. */
  brandName?: string;
  /** Optional title override (e.g. "Share links" for cross-brand). */
  title?: string;
  /** Optional description override. Falls back to a brand-scoped
   *  default. */
  description?: string;
  /** When true, prepend a Brand column so cross-brand views can
   *  distinguish rows. Defaults to `true` when `clientId === null`,
   *  off otherwise. The visual layout is otherwise identical for
   *  every caller. */
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
  const [links, setLinks] = useState<ReviewLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const grouped = useMemo(() => {
    const sorted = [...links].sort((a, b) => sortLinks(a, b, sort));
    const active = sorted.filter((l) => l.status !== 'expired');
    const expired = sorted.filter((l) => l.status === 'expired');
    return { active, expired };
  }, [links, sort]);

  function toggleRow(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(rows: ReviewLinkRow[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function openSelectedInTabs() {
    const tokens = links.filter((l) => selected.has(l.id)).map((l) => l.token);
    if (tokens.length === 0) return;
    for (const t of tokens) {
      window.open(`/c/${t}`, '_blank', 'noopener,noreferrer');
    }
    toast.success(`Opened ${tokens.length} review${tokens.length === 1 ? '' : 's'}`);
  }

  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text-primary">{title ?? 'Review'}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {description ??
              (brandName
                ? `Calendars and content sent to ${brandName} for review.`
                : 'Calendars and content sent for review.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SortMenu sort={sort} onChange={setSort} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </header>

      {loading ? (
        <ReviewTableSkeleton />
      ) : links.length === 0 ? (
        <EmptyState brandName={brandName} />
      ) : (
        <>
          <ReviewTableCard
            rows={grouped.active}
            selected={selected}
            onToggleRow={toggleRow}
            onToggleAll={(on) => toggleAll(grouped.active, on)}
            showBrand={showBrandColumn}
            bulkBar={
              <BulkActionBar
                count={selected.size}
                onClear={clearSelection}
                onOpenAll={openSelectedInTabs}
              />
            }
          />

          {grouped.expired.length > 0 && (
            <section className="space-y-3 pt-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Expired
              </h2>
              <ReviewTableCard
                rows={grouped.expired}
                selected={selected}
                onToggleRow={toggleRow}
                onToggleAll={(on) => toggleAll(grouped.expired, on)}
                showBrand={showBrandColumn}
                dim
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}

interface ReviewTableCardProps {
  rows: ReviewLinkRow[];
  selected: Set<string>;
  onToggleRow: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  showBrand?: boolean;
  dim?: boolean;
  bulkBar?: React.ReactNode;
}

/**
 * The table itself, in card variant. Above the `<thead>` we slot the
 * bulk-action bar — when there's a selection it slides into view, when
 * there isn't, the slot is empty and the table looks normal.
 */
function ReviewTableCard({
  rows,
  selected,
  onToggleRow,
  onToggleAll,
  showBrand = false,
  dim = false,
  bulkBar,
}: ReviewTableCardProps) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someChecked = rows.some((r) => selected.has(r.id));
  const headerState: boolean | 'indeterminate' = allChecked
    ? true
    : someChecked
      ? 'indeterminate'
      : false;

  return (
    <div className={dim ? 'opacity-70' : undefined}>
      {bulkBar}
      <Table variant="card">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all reviews"
                checked={headerState}
                onCheckedChange={(v) => onToggleAll(v === true)}
              />
            </TableHead>
            {showBrand && <TableHead>Brand</TableHead>}
            <TableHead>Project</TableHead>
            <TableHead>Items</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((link) => (
            <ReviewTableRow
              key={link.id}
              link={link}
              checked={selected.has(link.id)}
              onCheckedChange={(on) => onToggleRow(link.id, on)}
              showBrand={showBrand}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface ReviewTableRowProps {
  link: ReviewLinkRow;
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  showBrand?: boolean;
}

function ReviewTableRow({ link, checked, onCheckedChange, showBrand = false }: ReviewTableRowProps) {
  const project = formatProject(link.drop_start, link.drop_end);
  const lastSeen = link.last_viewed_at ? formatRelative(link.last_viewed_at) : null;
  const stage = currentStage(link);

  return (
    <TableRow data-state={checked ? 'selected' : undefined}>
      <TableCell className="w-10">
        <Checkbox
          aria-label={`Select ${project}`}
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
        />
      </TableCell>
      {showBrand && (
        <TableCell>
          <span className="text-sm text-text-secondary">{link.client_name ?? '—'}</span>
        </TableCell>
      )}
      <TableCell>
        <div className="font-medium text-text-primary">{project}</div>
        <div className="text-xs text-text-muted tabular-nums">
          {lastSeen ? `Last viewed ${lastSeen}` : 'Not yet viewed'}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="default">
          {link.post_count} post{link.post_count === 1 ? '' : 's'}
        </Badge>
      </TableCell>
      <TableCell>
        <StageTrack stage={stage} />
      </TableCell>
      <TableCell>
        <ProgressLabel link={link} />
      </TableCell>
      <TableCell className="text-right">
        <Link href={`/c/${link.token}`} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline">
            <span>Open review</span>
            <ExternalLink size={12} />
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
}

function ProgressLabel({ link }: { link: ReviewLinkRow }) {
  if (link.post_count === 0) {
    return <span className="text-xs text-text-muted">—</span>;
  }
  if (link.status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-success">
        <CheckIcon size={12} />
        All approved
      </span>
    );
  }
  if (link.changes_count > 0) {
    return (
      <span className="text-xs text-status-warning tabular-nums">
        {link.changes_count} need{link.changes_count === 1 ? 's' : ''} changes
      </span>
    );
  }
  return (
    <span className="text-xs text-text-secondary tabular-nums">
      {link.approved_count} of {link.post_count} approved
    </span>
  );
}

/**
 * Four-circle stage tracker. Past stages tinted with success token,
 * current stage filled with the accent, future stages muted.
 */
function StageTrack({ stage }: { stage: ReviewStage }) {
  const idx = stageIndex(stage);
  return (
    <div className="flex items-center gap-1.5">
      {STAGES.map((s, i) => {
        const Icon = s.icon;
        const reached = i < idx;
        const current = i === idx;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <div
              className={`flex size-5 items-center justify-center rounded-full border text-[10px] ${
                current
                  ? 'border-accent-text bg-accent-text text-background'
                  : reached
                    ? 'border-status-success/30 bg-status-success/10 text-status-success'
                    : 'border-nativz-border bg-background text-text-muted/60'
              }`}
              aria-label={s.label}
              title={s.label}
            >
              <Icon className="size-3" />
            </div>
            {i < STAGES.length - 1 && (
              <div
                className={`h-px w-3 ${
                  i < idx ? 'bg-status-success/40' : 'bg-nativz-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BulkActionBar({
  count,
  onClear,
  onOpenAll,
}: {
  count: number;
  onClear: () => void;
  onOpenAll: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-surface/40 px-4 py-2.5">
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={onClear}
          className="inline-flex size-5 items-center justify-center rounded text-text-muted hover:bg-surface-hover hover:text-text-primary"
          aria-label="Clear selection"
        >
          <X className="size-3.5" />
        </button>
        <span className="font-medium text-text-primary">
          {count} selected
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onOpenAll}>
          <ExternalLink size={12} />
          Open all
        </Button>
      </div>
    </div>
  );
}

function SortMenu({ sort, onChange }: { sort: SortKey; onChange: (s: SortKey) => void }) {
  const label =
    sort === 'newest' ? 'Newest first' : sort === 'oldest' ? 'Oldest first' : 'Most progress';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <ArrowUpDown size={14} />
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
      <div className="border-b border-nativz-border px-5 py-3">
        <div className="h-3 w-24 animate-pulse rounded bg-nativz-border" />
      </div>
      <div className="divide-y divide-nativz-border/60">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="size-4 animate-pulse rounded bg-nativz-border" />
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
    return stageIndex(currentStage(b)) - stageIndex(currentStage(a));
  }
  const aT = new Date(a.created_at ?? a.drop_start ?? 0).getTime();
  const bT = new Date(b.created_at ?? b.drop_start ?? 0).getTime();
  return sort === 'newest' ? bT - aT : aT - bT;
}

/** "May 2026 content" / "May–June 2026 content" / fallback. Names look
 *  like project labels rather than literal date ranges so the column
 *  reads as a portfolio of work, not a calendar slice. */
function formatProject(start: string | null, end: string | null): string {
  if (!start || !end) return 'Content review';
  const s = new Date(start);
  const e = new Date(end);
  const sM = s.toLocaleString('default', { month: 'long' });
  const eM = e.toLocaleString('default', { month: 'long' });
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = s.getMonth() === e.getMonth() && sameYear;
  if (sameMonth) {
    return `${sM} ${s.getFullYear()} content`;
  }
  if (sameYear) {
    return `${sM}–${eM} ${s.getFullYear()} content`;
  }
  return `${sM} ${s.getFullYear()} – ${eM} ${e.getFullYear()} content`;
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
