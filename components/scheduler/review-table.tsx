'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  CheckIcon,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  MessagesSquare,
  RefreshCcw,
  Send,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ReviewLinkRow } from '@/components/scheduler/review-board';

/**
 * Viewer review surface — table layout. Built on the shared
 * `<Table variant="card">` primitive so the whole list lives inside
 * one rounded surface with hairline dividers between rows, matching
 * the agency's "All Reports" pattern.
 *
 * Always brand-scoped: the page that mounts this passes `clientId`
 * from the active brand pill, so the table never mixes brands.
 * Admin-only cross-brand oversight stays on `/admin/share-links`,
 * which renders the same component with `clientId={null}` and a
 * Brand column toggled on.
 *
 * Stage track derives from existing aggregates returned by
 * `/api/calendar/review` — no schema changes:
 *
 *   Sent  →  Viewed  →  Reviewing  →  Approved
 *
 * The row is the click target (opens the review in a new tab).
 * No selection / bulk actions — viewers open one calendar at a time.
 */

type ReviewStage = 'sent' | 'viewed' | 'reviewing' | 'approved';

const STAGES: {
  key: ReviewStage;
  label: string;
  icon: typeof CheckIcon;
  description: string;
}[] = [
  { key: 'sent', label: 'Sent', icon: Send, description: 'Calendar shared, awaiting first view.' },
  { key: 'viewed', label: 'Viewed', icon: Eye, description: 'Opened by the client, no feedback yet.' },
  {
    key: 'reviewing',
    label: 'Reviewing',
    icon: MessagesSquare,
    description: 'Comments or change requests posted.',
  },
  { key: 'approved', label: 'Approved', icon: CheckIcon, description: 'All posts signed off.' },
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

  const grouped = useMemo(() => {
    const sorted = [...links].sort((a, b) => sortLinks(a, b, sort));
    const active = sorted.filter((l) => l.status !== 'expired');
    const expired = sorted.filter((l) => l.status === 'expired');
    return { active, expired };
  }, [links, sort]);

  const total = links.length;
  const subtitle =
    description ??
    (brandName
      ? `${brandName} · ${total} share link${total === 1 ? '' : 's'}`
      : `All brands · ${total} share link${total === 1 ? '' : 's'}`);

  return (
    <TooltipProvider>
      <div className="cortex-page-gutter mx-auto max-w-6xl space-y-5">
        <header className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text-primary">{title ?? 'Review'}</h1>
            <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
          </div>
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
        </header>

        {loading ? (
          <ReviewTableSkeleton />
        ) : links.length === 0 ? (
          <EmptyState brandName={brandName} />
        ) : (
          <>
            <ReviewTableCard
              rows={grouped.active}
              showBrand={showBrandColumn}
              cardTitle={title ?? 'Calendars'}
              count={grouped.active.length}
            />

            {grouped.expired.length > 0 && (
              <section className="space-y-3 pt-2">
                <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Expired
                </h2>
                <ReviewTableCard
                  rows={grouped.expired}
                  showBrand={showBrandColumn}
                  cardTitle="Expired"
                  count={grouped.expired.length}
                  dim
                />
              </section>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

interface ReviewTableCardProps {
  rows: ReviewLinkRow[];
  showBrand?: boolean;
  cardTitle: string;
  count: number;
  dim?: boolean;
}

/**
 * The card-variant table itself — a single rounded surface with a
 * tinted summary strip on top, then divider rows underneath. Each
 * row is the click target (no per-row action button); a chevron on
 * the right hints the row leads somewhere.
 */
function ReviewTableCard({
  rows,
  showBrand = false,
  cardTitle,
  count,
  dim = false,
}: ReviewTableCardProps) {
  return (
    <div className={dim ? 'opacity-70' : undefined}>
      <Table variant="card">
        <thead>
          {/* Title strip — sits flush inside the card border above the
           *  column-header row. Mirrors the "All Reports · 8 reports
           *  found" pattern from the reference. */}
          <tr>
            <th
              colSpan={4 + (showBrand ? 1 : 0) + 1}
              className="border-b border-nativz-border px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 text-left">
                  <div className="text-sm font-semibold text-text-primary">{cardTitle}</div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {count} calendar{count === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <TableHeader>
          <TableRow>
            {showBrand && <TableHead>Brand</TableHead>}
            <TableHead>Calendar</TableHead>
            <TableHead>Posts</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-right">Progress</TableHead>
            <TableHead className="w-10" aria-label="Open" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((link) => (
            <ReviewTableRow key={link.id} link={link} showBrand={showBrand} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface ReviewTableRowProps {
  link: ReviewLinkRow;
  showBrand?: boolean;
}

function ReviewTableRow({ link, showBrand = false }: ReviewTableRowProps) {
  const project = formatCalendarName(link.drop_start, link.drop_end);
  const lastSeen = link.last_viewed_at ? formatRelative(link.last_viewed_at) : null;
  const stage = currentStage(link);

  function openReview() {
    window.open(`/c/${link.token}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <TableRow onClick={openReview} className="cursor-pointer">
      {showBrand && (
        <TableCell>
          <span className="text-sm text-text-secondary">{link.client_name ?? '—'}</span>
        </TableCell>
      )}
      <TableCell>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-nativz-border bg-background text-text-muted">
            <CalendarDays className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-text-primary">{project}</div>
            <div className="text-xs text-text-muted tabular-nums">
              {lastSeen ? `Last viewed ${lastSeen}` : 'Not yet viewed'}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center rounded-md border border-nativz-border px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
          {link.post_count} post{link.post_count === 1 ? '' : 's'}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <div className="flex justify-center">
          <StagePill stage={stage} />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <ProgressLabel link={link} />
      </TableCell>
      <TableCell className="w-10 text-right text-text-muted">
        <ChevronRight className="size-4" />
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
 * Status pill — shows the current stage as a single coloured badge
 * with an icon, the way the reference's "Completed / In Progress"
 * pills work. Hovering reveals the full pipeline progression so the
 * row stays compact but the stage is unambiguous.
 *
 * Color rules:
 *   - approved → success (green)
 *   - reviewing → warning (amber)  — needs attention
 *   - viewed → accent (blue)        — moving along
 *   - sent → muted neutral          — quietly waiting
 */
function StagePill({ stage }: { stage: ReviewStage }) {
  const meta = STAGES[stageIndex(stage)];
  const Icon = meta.icon;

  const tone =
    stage === 'approved'
      ? 'border-status-success/30 bg-status-success/10 text-status-success'
      : stage === 'reviewing'
        ? 'border-status-warning/30 bg-status-warning/10 text-status-warning'
        : stage === 'viewed'
          ? 'border-accent-text/30 bg-accent-text/10 text-accent-text'
          : 'border-nativz-border bg-background text-text-muted';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}
        >
          <Icon className="size-3" />
          {meta.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="w-56">
        <div className="font-medium text-text-primary">{meta.label}</div>
        <div className="mt-0.5 text-text-muted">{meta.description}</div>
        <StageMiniTrack stage={stage} />
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Tiny four-circle progression shown inside the tooltip. Lets the
 * viewer see at a glance where this calendar sits in the full
 * Sent → Approved arc without crowding the row itself.
 */
function StageMiniTrack({ stage }: { stage: ReviewStage }) {
  const idx = stageIndex(stage);
  return (
    <div className="mt-2 flex items-center gap-1">
      {STAGES.map((s, i) => {
        const reached = i < idx;
        const current = i === idx;
        return (
          <div key={s.key} className="flex items-center gap-1">
            <div
              className={`size-1.5 rounded-full ${
                current
                  ? 'bg-accent-text'
                  : reached
                    ? 'bg-status-success/60'
                    : 'bg-nativz-border'
              }`}
              aria-label={s.label}
            />
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
    return stageIndex(currentStage(b)) - stageIndex(currentStage(a));
  }
  const aT = new Date(a.created_at ?? a.drop_start ?? 0).getTime();
  const bT = new Date(b.created_at ?? b.drop_start ?? 0).getTime();
  return sort === 'newest' ? bT - aT : aT - bT;
}

/**
 * Calendar-name formatter. Content calendars are always **for the
 * latter month** of the drop window — a calendar drafted in April
 * that drops across April–May posts is the "May 2026 content
 * calendar" to the client. We name by the END month so client-facing
 * copy reads as the month being delivered.
 *
 * Same-month windows: "May 2026 content calendar".
 * Cross-month windows: still named by the end month.
 * Cross-year windows: include the end year alone — the start month
 * has already passed at delivery time.
 */
function formatCalendarName(start: string | null, end: string | null): string {
  if (!end) return 'Content calendar';
  const e = new Date(end);
  if (Number.isNaN(e.getTime())) return 'Content calendar';
  const eMonth = e.toLocaleString('default', { month: 'long' });
  // Use the end-date year so a Dec-start / Jan-end window reads as
  // the January calendar, not the December one.
  return `${eMonth} ${e.getFullYear()} content calendar`;
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
