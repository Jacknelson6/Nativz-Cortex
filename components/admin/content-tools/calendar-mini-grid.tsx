'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileText } from 'lucide-react';
import { thumbUrl } from '@/lib/calendar/thumb-url';

/**
 * Compact month grid for the unified review modal's Calendar tab. Shows
 * each scheduled post on its day cell as a 1:1 thumbnail with a status
 * badge: green check (published), red x (failed/partially failed),
 * amber clock (publishing/scheduled), muted file (draft).
 *
 * Inputs come from GET /api/calendar/drops/[id]:
 *   - `videos`               content_drop_videos rows (have thumbnail_url)
 *   - `postStatusByPostId`   live publish state keyed by scheduled_post_id
 *
 * For posts that have been scheduled to Zernio, scheduled_at + status come
 * from postStatusByPostId. For unscheduled drafts we fall back to the
 * draft_scheduled_at on the video row so the grid still shows the planned
 * date.
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
}

type Resolved = {
  id: string;
  scheduledPostId: string | null;
  date: Date;
  dateKey: string;
  thumb: string | null;
  caption: string;
  status: 'published' | 'failed' | 'partially_failed' | 'publishing' | 'scheduled' | 'draft' | 'unknown';
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolvePosts(
  videos: MiniVideo[],
  postStatusByPostId: Record<string, MiniPostStatus>,
  postCoverByPostId: Record<string, string | null> | undefined,
): Resolved[] {
  const resolved: Resolved[] = [];
  for (const v of videos) {
    const live = v.scheduled_post_id ? postStatusByPostId[v.scheduled_post_id] : undefined;
    const iso = live?.scheduled_at ?? v.draft_scheduled_at;
    if (!iso) continue;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    const liveStatus = live?.status as Resolved['status'] | undefined;
    const status: Resolved['status'] = liveStatus ?? 'draft';
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
}: CalendarMiniGridProps) {
  const resolved = useMemo(
    () => resolvePosts(videos, postStatusByPostId, postCoverByPostId),
    [videos, postStatusByPostId, postCoverByPostId],
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

      {/* Grid */}
      <div className="grid flex-1 grid-cols-7 auto-rows-fr">
        {cells.map(({ date, dateStr, inMonth }) => {
          const dayPosts = postsByDate[dateStr] ?? [];
          const isToday = dateStr === today;
          return (
            <div
              key={dateStr}
              className={`flex min-h-[68px] flex-col gap-1 border-b border-r border-nativz-border p-1.5 ${
                !inMonth ? 'opacity-40' : ''
              } ${isToday ? 'bg-accent-surface/10' : ''}`}
            >
              <span
                className={`text-[10px] font-medium ${
                  isToday ? 'text-accent-text' : 'text-text-muted'
                }`}
              >
                {date.getDate()}
              </span>
              {dayPosts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {dayPosts.slice(0, 3).map((p) => (
                    <PostThumb
                      key={p.id}
                      post={p}
                      href={
                        p.scheduledPostId && getPostHref
                          ? getPostHref(p.scheduledPostId) ?? undefined
                          : undefined
                      }
                    />
                  ))}
                  {dayPosts.length > 3 && (
                    <span className="self-end text-[10px] text-text-muted">
                      +{dayPosts.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostThumb({ post, href }: { post: Resolved; href?: string }) {
  const thumb = thumbUrl(post.thumb, 80);
  const time = post.date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const tooltip = `${time} · ${post.caption.slice(0, 140)}${post.caption.length > 140 ? '…' : ''}`;
  const inner = (
    <>
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="h-9 w-9 rounded object-cover"
        />
      ) : (
        <div className="h-9 w-9 rounded bg-surface-hover" />
      )}
      <StatusBadge status={post.status} />
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={tooltip}
        className="relative block h-9 w-9 rounded outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent"
      >
        {inner}
      </a>
    );
  }
  return (
    <div className="relative h-9 w-9" title={tooltip}>
      {inner}
    </div>
  );
}

function StatusBadge({ status }: { status: Resolved['status'] }) {
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
      className={`absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-surface ${bg}`}
    >
      <Icon size={8} className="text-white" />
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
