'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  CheckIcon,
  Eye,
  ExternalLink,
  MessagesSquare,
  RefreshCcw,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReviewLinkRow } from '@/components/scheduler/review-board';

/**
 * Viewer review surface — table layout (replaces the bento grid for the
 * client side at /review). One row per share link the client has access
 * to, with a 4-stage progress track:
 *
 *   Sent  →  Viewed  →  Reviewing  →  Approved
 *
 * Stages are derived from existing aggregates returned by
 * `/api/calendar/review` — no schema changes.
 *
 * Always brand-scoped: the page that mounts this passes `clientId` from
 * the active brand pill, so the table never mixes brands. Admin-only
 * cross-brand oversight stays on `/admin/share-links`.
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
  // "Revising" status from the API maps to stage 3 (the client has left
  // feedback). "ready_for_review" with no view yet → stage 1; with a view
  // but no comments → stage 2.
  if (link.status === 'revising') return 'reviewing';
  if (link.changes_count > 0) return 'reviewing';
  if (link.last_viewed_at) return 'viewed';
  return 'sent';
}

interface ReviewTableProps {
  /** Active brand id from the top-bar pill. Required — this surface is
   *  always brand-scoped. */
  clientId: string;
  /** Optional brand name for header copy. */
  brandName?: string;
}

export function ReviewTable({ clientId, brandName }: ReviewTableProps) {
  const [links, setLinks] = useState<ReviewLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(
        `/api/calendar/review?clientId=${encodeURIComponent(clientId)}`,
        { cache: 'no-store' },
      );
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
    // Refetch when the active brand changes upstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const grouped = useMemo(() => {
    const active = links.filter((l) => l.status !== 'expired');
    const expired = links.filter((l) => l.status === 'expired');
    return { active, expired };
  }, [links]);

  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text-primary">Review</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {brandName
              ? `Calendars and content sent to ${brandName} for review.`
              : 'Calendars and content sent for review.'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load(true)}
          disabled={refreshing}
        >
          <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </header>

      {loading ? (
        <ReviewTableSkeleton />
      ) : links.length === 0 ? (
        <EmptyState brandName={brandName} />
      ) : (
        <>
          <ReviewTableCard rows={grouped.active} />

          {grouped.expired.length > 0 && (
            <section className="space-y-3 pt-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Expired
              </h2>
              <ReviewTableCard rows={grouped.expired} dim />
            </section>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The table itself. Wrapped in a card surface so the whole table reads
 * as one panel — matches the "card-variant table" treatment in the
 * reference design.
 */
function ReviewTableCard({ rows, dim = false }: { rows: ReviewLinkRow[]; dim?: boolean }) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-nativz-border bg-surface ${
        dim ? 'opacity-70' : ''
      }`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-nativz-border text-left text-xs font-medium uppercase tracking-wide text-text-muted">
              <th className="px-5 py-3 font-medium">Project</th>
              <th className="px-3 py-3 font-medium">Items</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Progress</th>
              <th className="px-5 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((link, i) => (
              <ReviewTableRow key={link.id} link={link} isLast={i === rows.length - 1} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewTableRow({ link, isLast }: { link: ReviewLinkRow; isLast: boolean }) {
  const project = formatProject(link.drop_start, link.drop_end);
  const lastSeen = link.last_viewed_at ? formatRelative(link.last_viewed_at) : null;
  const stage = currentStage(link);

  return (
    <tr
      className={`group transition-colors hover:bg-surface-hover ${
        isLast ? '' : 'border-b border-nativz-border/60'
      }`}
    >
      <td className="px-5 py-4 align-middle">
        <div className="font-medium text-text-primary">{project}</div>
        <div className="text-xs text-text-muted tabular-nums">
          {lastSeen ? `Last viewed ${lastSeen}` : 'Not yet viewed'}
        </div>
      </td>
      <td className="px-3 py-4 align-middle">
        <span className="inline-flex items-center rounded-md border border-nativz-border bg-background px-2 py-0.5 font-mono text-[10px] text-text-secondary">
          {link.post_count} post{link.post_count === 1 ? '' : 's'}
        </span>
      </td>
      <td className="px-3 py-4 align-middle">
        <StageTrack stage={stage} />
      </td>
      <td className="px-3 py-4 align-middle">
        <ProgressLabel link={link} />
      </td>
      <td className="px-5 py-4 text-right align-middle">
        <Link href={`/c/${link.token}`} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline">
            <span>Open review</span>
            <ExternalLink size={12} />
          </Button>
        </Link>
      </td>
    </tr>
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
 * current stage filled with the accent, future stages muted. Mirrors the
 * "Order → Packed → Shipped → Delivered" reference but for content
 * review.
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

function ReviewTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="border-b border-nativz-border px-5 py-3">
        <div className="h-3 w-24 animate-pulse rounded bg-nativz-border" />
      </div>
      <div className="divide-y divide-nativz-border/60">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
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
