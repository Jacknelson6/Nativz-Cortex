'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  X,
} from 'lucide-react';
import { thumbUrl } from '@/lib/calendar/thumb-url';

/**
 * Compact month grid for the unified review modal's Calendar tab. Each
 * scheduled post lands on its day cell as a 1:1 thumbnail with a status
 * badge: green check (published), red x (failed/partially failed), amber
 * clock (publishing), sky clock (scheduled), muted file (draft).
 *
 * Interactions:
 *   - Hover a thumbnail → portaled preview card (bigger image + caption +
 *     time + status).
 *   - Click a thumbnail → in-component overlay with full caption and
 *     "Open in scheduler" deep link.
 *   - Drag a thumbnail onto another day cell → optimistic reschedule.
 *     Scheduled posts hit `PUT /api/scheduler/posts/[id]`; unscheduled
 *     drafts hit `PATCH /api/calendar/drops/[dropId]/videos/[videoId]`.
 *     The time-of-day is preserved; only the calendar date changes.
 *
 * Inputs come from `GET /api/calendar/drops/[id]`:
 *   - `videos`               content_drop_videos rows (carry thumbnail_url)
 *   - `postStatusByPostId`   live publish state keyed by scheduled_post_id
 */

interface MiniVideo {
  id: string;
  scheduled_post_id: string | null;
  thumbnail_url: string | null;
  draft_scheduled_at: string | null;
  draft_caption: string | null;
}

interface MiniPostStatus {
  status: string;
  scheduled_at: string | null;
  platforms: { status: string }[];
}

interface CalendarMiniGridProps {
  videos: MiniVideo[];
  postStatusByPostId: Record<string, MiniPostStatus>;
  /** Cover thumbnail per post for image drops (carousel). Optional;
   *  videos already carry thumbnail_url for video drops. */
  postCoverByPostId?: Record<string, string | null>;
  /** Initial month to display. Defaults to the earliest scheduled date
   *  on the drop, falling back to the current month. */
  initialDate?: Date | null;
  /** Returns a URL to deep-link into when a thumbnail is clicked. Receives
   *  the `scheduled_post_id` (the value the drop detail page anchors on).
   *  Returning `null` skips the link for that post (e.g. unscheduled
   *  drafts that don't have a scheduled_post yet). */
  getPostHref?: (scheduledPostId: string) => string | null;
  /** Drop ID, required to enable drag-and-drop reschedule. When omitted,
   *  drag handles render but drops are no-ops (read-only mode). */
  dropId?: string | null;
}

type Status =
  | 'published'
  | 'failed'
  | 'partially_failed'
  | 'publishing'
  | 'scheduled'
  | 'draft'
  | 'unknown';

type Resolved = {
  /** content_drop_videos.id (always present, used as drag key). */
  id: string;
  scheduledPostId: string | null;
  date: Date;
  dateKey: string;
  thumb: string | null;
  caption: string;
  status: Status;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolvePosts(
  videos: MiniVideo[],
  postStatusByPostId: Record<string, MiniPostStatus>,
  postCoverByPostId: Record<string, string | null> | undefined,
  overrides: Map<string, string>,
): Resolved[] {
  const resolved: Resolved[] = [];
  for (const v of videos) {
    const live = v.scheduled_post_id ? postStatusByPostId[v.scheduled_post_id] : undefined;
    const overrideIso = overrides.get(v.id);
    const iso = overrideIso ?? live?.scheduled_at ?? v.draft_scheduled_at;
    if (!iso) continue;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    const liveStatus = live?.status as Status | undefined;
    const status: Status = liveStatus ?? 'draft';
    resolved.push({
      id: v.id,
      scheduledPostId: v.scheduled_post_id,
      date,
      dateKey: dateKey(date),
      thumb: v.thumbnail_url ?? postCoverByPostId?.[v.id] ?? null,
      caption: v.draft_caption?.trim() || 'No caption',
      status,
    });
  }
  return resolved;
}

export function CalendarMiniGrid({
  videos,
  postStatusByPostId,
  postCoverByPostId,
  initialDate,
  getPostHref,
  dropId,
}: CalendarMiniGridProps) {
  // Optimistic overrides for drag-and-drop reschedules. Keyed by video id.
  // Reset whenever the parent pushes a fresh `videos` payload, since the
  // server response then becomes authoritative.
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    setOverrides(new Map());
  }, [videos]);

  const resolved = useMemo(
    () => resolvePosts(videos, postStatusByPostId, postCoverByPostId, overrides),
    [videos, postStatusByPostId, postCoverByPostId, overrides],
  );

  const earliest = useMemo(() => {
    if (resolved.length === 0) return null;
    return resolved.reduce(
      (min, p) => (p.date.getTime() < min.getTime() ? p.date : min),
      resolved[0].date,
    );
  }, [resolved]);

  const [cursor, setCursor] = useState<Date>(() => {
    const seed = initialDate ?? earliest ?? new Date();
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });

  const today = useMemo(() => dateKey(new Date()), []);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const totalCells = startOffset + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);

  const cells: { date: Date; dateStr: string; inMonth: boolean }[] = [];
  for (let i = 0; i < rows * 7; i++) {
    const date = new Date(year, month, 1 - startOffset + i);
    cells.push({
      date,
      dateStr: dateKey(date),
      inMonth: date.getMonth() === month,
    });
  }

  const postsByDate: Record<string, Resolved[]> = {};
  for (const p of resolved) {
    (postsByDate[p.dateKey] ||= []).push(p);
  }
  for (const k of Object.keys(postsByDate)) {
    postsByDate[k].sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  const monthName = cursor.toLocaleString('default', { month: 'long' });
  const publishedCount = resolved.filter((p) => p.status === 'published').length;
  const totalCount = resolved.length;

  // Hover preview + click popover state.
  const [hover, setHover] = useState<{ post: Resolved; rect: DOMRect } | null>(
    null,
  );
  const [popover, setPopover] = useState<Resolved | null>(null);

  // Drag-drop state.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pendingMoves, setPendingMoves] = useState<Set<string>>(new Set());
  const [dragError, setDragError] = useState<string | null>(null);

  async function handleDrop(targetDateStr: string, post: Resolved) {
    setDropTarget(null);
    setDraggingId(null);
    if (post.dateKey === targetDateStr) return;
    const [y, m, d] = targetDateStr.split('-').map(Number);
    const next = new Date(post.date);
    next.setFullYear(y, m - 1, d);
    const newIso = next.toISOString();

    setOverrides((prev) => {
      const map = new Map(prev);
      map.set(post.id, newIso);
      return map;
    });
    setPendingMoves((prev) => {
      const set = new Set(prev);
      set.add(post.id);
      return set;
    });

    try {
      let res: Response;
      if (post.scheduledPostId) {
        res = await fetch(`/api/scheduler/posts/${post.scheduledPostId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_at: newIso }),
        });
      } else {
        if (!dropId) throw new Error('Missing dropId for draft reschedule');
        res = await fetch(`/api/calendar/drops/${dropId}/videos/${post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduledAt: newIso }),
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body?.error as string) ?? 'Reschedule failed');
      }
      // Soft warning: DB updated fine but Zernio rejected the reschedule
      // (post already published, network blip, etc.). Surface it in the
      // toast so the user knows the queue may publish at the old time —
      // we don't roll back the optimistic move because our DB is the
      // authoritative source of truth.
      const okBody = await res.json().catch(() => null);
      if (okBody?.zernio_sync_warning) {
        setDragError(
          `Calendar updated, but Zernio queue may still post at the old time (${okBody.zernio_sync_warning}).`,
        );
      }
    } catch (err) {
      // Rollback optimistic move and surface a non-blocking error toast.
      setOverrides((prev) => {
        const map = new Map(prev);
        map.delete(post.id);
        return map;
      });
      setDragError(
        err instanceof Error ? err.message : 'Could not reschedule that post',
      );
    } finally {
      setPendingMoves((prev) => {
        const set = new Set(prev);
        set.delete(post.id);
        return set;
      });
    }
  }

  // Auto-clear the error toast after a few seconds.
  useEffect(() => {
    if (!dragError) return;
    const t = setTimeout(() => setDragError(null), 4000);
    return () => clearTimeout(t);
  }, [dragError]);

  if (resolved.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-lg border border-dashed border-nativz-border bg-surface text-sm text-text-muted">
        No scheduled posts on this drop yet.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-nativz-border bg-surface">
      {/* Navigation */}
      <div className="flex items-center justify-between border-b border-nativz-border px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label="Previous month"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label="Next month"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <ChevronRight size={14} />
          </button>
          <h3 className="ml-1 text-sm font-semibold text-text-primary">
            {monthName} {year}
          </h3>
          <span className="ml-2 text-[11px] text-text-muted">
            {publishedCount} of {totalCount} published
          </span>
        </div>
        <Legend />
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-nativz-border">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-1 py-1 text-center text-[10px] font-medium uppercase tracking-wide text-text-muted"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid. Fixed row height keeps thumbnails comfortably sized; the
          tab wrapper handles overflow scrolling when the month is tall. */}
      <div className="grid grid-cols-7 auto-rows-[132px]">
        {cells.map(({ date, dateStr, inMonth }) => {
          const dayPosts = postsByDate[dateStr] ?? [];
          const isToday = dateStr === today;
          const isDropTarget = dropTarget === dateStr;
          return (
            <div
              key={dateStr}
              onDragOver={(e) => {
                if (draggingId) {
                  e.preventDefault();
                  if (dropTarget !== dateStr) setDropTarget(dateStr);
                }
              }}
              onDragLeave={() => {
                if (dropTarget === dateStr) setDropTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!draggingId) return;
                const post = resolved.find((p) => p.id === draggingId);
                if (post) void handleDrop(dateStr, post);
              }}
              className={`flex flex-col gap-1.5 border-b border-r border-nativz-border p-1.5 transition-colors ${
                !inMonth ? 'opacity-40' : ''
              } ${isToday ? 'bg-accent-surface/10' : ''} ${
                isDropTarget ? 'bg-accent-surface/30 ring-1 ring-inset ring-accent' : ''
              }`}
            >
              <span
                className={`text-[10px] font-medium ${
                  isToday ? 'text-accent-text' : 'text-text-muted'
                }`}
              >
                {date.getDate()}
              </span>
              {dayPosts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {dayPosts.slice(0, 2).map((p) => (
                    <PostThumb
                      key={p.id}
                      post={p}
                      pending={pendingMoves.has(p.id)}
                      dragging={draggingId === p.id}
                      onDragStart={() => setDraggingId(p.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDropTarget(null);
                      }}
                      onHover={(rect) => setHover({ post: p, rect })}
                      onUnhover={() => setHover(null)}
                      onClick={() => setPopover(p)}
                    />
                  ))}
                  {dayPosts.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPopover(dayPosts[2])}
                      className="self-end rounded bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
                    >
                      +{dayPosts.length - 2}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hover && !popover && !draggingId && (
        <HoverPreview post={hover.post} anchor={hover.rect} />
      )}
      {popover && (
        <PostPopover
          post={popover}
          onClose={() => setPopover(null)}
          href={
            popover.scheduledPostId && getPostHref
              ? getPostHref(popover.scheduledPostId) ?? undefined
              : undefined
          }
        />
      )}
      {dragError && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-red-500/95 px-3 py-2 text-xs font-medium text-white shadow-lg">
          {dragError}
        </div>
      )}
    </div>
  );
}

interface PostThumbProps {
  post: Resolved;
  pending: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onHover: (rect: DOMRect) => void;
  onUnhover: () => void;
  onClick: () => void;
}

function PostThumb({
  post,
  pending,
  dragging,
  onDragStart,
  onDragEnd,
  onHover,
  onUnhover,
  onClick,
}: PostThumbProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const thumb = thumbUrl(post.thumb, 120);
  return (
    <button
      ref={ref}
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        // Required by Firefox to actually start a drag.
        e.dataTransfer.setData('text/plain', post.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => {
        if (ref.current) onHover(ref.current.getBoundingClientRect());
      }}
      onMouseLeave={onUnhover}
      onClick={onClick}
      className={`relative block h-12 w-12 cursor-grab rounded outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing ${
        dragging ? 'opacity-30' : ''
      } ${pending ? 'animate-pulse' : ''}`}
      aria-label={`${post.status} post on ${post.date.toLocaleDateString()}`}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          draggable={false}
          className="h-12 w-12 rounded object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded bg-surface-hover">
          <FileText size={16} className="text-text-muted" />
        </div>
      )}
      <StatusBadge status={post.status} />
    </button>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const config = (() => {
    switch (status) {
      case 'published':
        return { Icon: CheckCircle2, bg: 'bg-emerald-500', label: 'Published' };
      case 'failed':
      case 'partially_failed':
        return { Icon: AlertTriangle, bg: 'bg-red-500', label: 'Failed' };
      case 'publishing':
        return { Icon: Clock, bg: 'bg-amber-500', label: 'Publishing' };
      case 'scheduled':
        return { Icon: Clock, bg: 'bg-sky-500', label: 'Scheduled' };
      case 'draft':
        return { Icon: FileText, bg: 'bg-zinc-500', label: 'Draft' };
      default:
        return { Icon: FileText, bg: 'bg-zinc-500', label: status };
    }
  })();
  const { Icon, bg, label } = config;
  return (
    <span
      title={label}
      className={`absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-surface ${bg}`}
    >
      <Icon size={10} className="text-white" />
    </span>
  );
}

function HoverPreview({
  post,
  anchor,
}: {
  post: Resolved;
  anchor: DOMRect;
}) {
  // Position the card adjacent to the thumbnail. Prefer the right side; if
  // the thumb is too close to the viewport edge, flip to the left. Vertical
  // alignment is centered against the thumb but clamped to stay on-screen.
  const cardWidth = 280;
  const cardHeight = 320;
  const margin = 12;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

  let left = anchor.right + margin;
  if (left + cardWidth > vw - 8) {
    left = anchor.left - cardWidth - margin;
  }
  if (left < 8) left = 8;

  let top = anchor.top + anchor.height / 2 - cardHeight / 2;
  if (top + cardHeight > vh - 8) top = vh - cardHeight - 8;
  if (top < 8) top = 8;

  const thumb = thumbUrl(post.thumb, 480);
  const time = post.date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-50 w-[280px] overflow-hidden rounded-lg border border-nativz-border bg-surface shadow-xl"
      style={{ left, top }}
    >
      <div className="relative aspect-square w-full bg-surface-hover">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileText size={32} className="text-text-muted" />
          </div>
        )}
        <span className="absolute right-2 top-2">
          <StatusPill status={post.status} />
        </span>
      </div>
      <div className="space-y-1 p-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
          {time}
        </div>
        <p className="line-clamp-4 text-xs leading-relaxed text-text-primary">
          {post.caption}
        </p>
      </div>
    </div>,
    document.body,
  );
}

function PostPopover({
  post,
  onClose,
  href,
}: {
  post: Resolved;
  onClose: () => void;
  href?: string;
}) {
  // Close on Escape so keyboard users can dismiss without reaching for the
  // close button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const thumb = thumbUrl(post.thumb, 720);
  const dateLine = post.date.toLocaleString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-nativz-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
        >
          <X size={16} />
        </button>
        <div className="relative aspect-square w-full bg-surface-hover">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <FileText size={48} className="text-text-muted" />
            </div>
          )}
          <span className="absolute left-3 top-3">
            <StatusPill status={post.status} />
          </span>
        </div>
        <div className="space-y-3 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {dateLine}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
            {post.caption}
          </p>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Open in scheduler
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatusPill({ status }: { status: Status }) {
  const config = (() => {
    switch (status) {
      case 'published':
        return { bg: 'bg-emerald-500', label: 'Published' };
      case 'failed':
      case 'partially_failed':
        return { bg: 'bg-red-500', label: 'Failed' };
      case 'publishing':
        return { bg: 'bg-amber-500', label: 'Publishing' };
      case 'scheduled':
        return { bg: 'bg-sky-500', label: 'Scheduled' };
      case 'draft':
        return { bg: 'bg-zinc-500', label: 'Draft' };
      default:
        return { bg: 'bg-zinc-500', label: status };
    }
  })();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${config.bg}`}
    >
      {config.label}
    </span>
  );
}

function Legend() {
  const items: { label: string; bg: string }[] = [
    { label: 'Published', bg: 'bg-emerald-500' },
    { label: 'Scheduled', bg: 'bg-sky-500' },
    { label: 'Failed', bg: 'bg-red-500' },
    { label: 'Draft', bg: 'bg-zinc-500' },
  ];
  return (
    <div className="hidden items-center gap-3 text-[10px] text-text-muted sm:flex">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${i.bg}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
