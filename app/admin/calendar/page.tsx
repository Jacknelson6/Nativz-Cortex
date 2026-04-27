'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, Film, FolderInput,
  List, Loader2, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useActiveBrand } from '@/lib/admin/active-client-context';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { ContentDrop, DropStatus } from '@/lib/types/calendar';

interface SchedulerPost {
  id: string;
  client_id: string;
  status: string;
  scheduled_at: string | null;
  caption: string;
  hashtags: string[];
  cover_image_url: string | null;
  thumbnail_url: string | null;
  platforms: { platform: string; username: string; status: string }[];
}

type CalendarView = 'month' | 'list';

export default function CalendarPage() {
  const router = useRouter();
  const { brand } = useActiveBrand();
  const [posts, setPosts] = useState<SchedulerPost[]>([]);
  const [drops, setDrops] = useState<ContentDrop[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [view, setView] = useState<CalendarView>('month');
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    const clientId = brand?.id;
    if (!clientId) {
      setPosts([]);
      setDrops([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [postsRes, dropsRes] = await Promise.all([
          fetch(`/api/scheduler/posts?client_id=${clientId}`),
          fetch(`/api/calendar/drops?clientId=${clientId}`),
        ]);
        const postsJson = await postsRes.json();
        const dropsJson = await dropsRes.json();
        if (!cancelled) {
          setPosts(postsJson.posts ?? []);
          setDrops(dropsJson.drops ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brand?.id]);

  const monthLabel = useMemo(
    () => cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    [cursor],
  );

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  function goToday() {
    const d = new Date();
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  return (
    <div className="cortex-page-gutter mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 shrink">
          <h1 className="text-2xl font-semibold text-text-primary">Content calendar</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Every post scheduled for {brand?.name ?? 'this brand'}, laid out across the month.
          </p>
        </div>
        {brand && (
          <Button onClick={() => setShowNew(true)}>
            <Plus size={16} />
            New content calendar
          </Button>
        )}
      </header>

      {!brand && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">Pick a brand from the top bar to get started.</p>
        </div>
      )}

      {brand && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-nativz-border bg-surface px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goToday}
                className="rounded-lg border border-nativz-border bg-transparent px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="rounded-lg border border-nativz-border bg-transparent p-1 text-text-secondary transition-colors hover:bg-surface-hover"
                aria-label="Previous month"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="rounded-lg border border-nativz-border bg-transparent p-1 text-text-secondary transition-colors hover:bg-surface-hover"
                aria-label="Next month"
              >
                <ChevronRight size={14} />
              </button>
              <span className="ml-2 text-sm font-medium text-text-primary">{monthLabel}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">
                {posts.filter((p) => p.scheduled_at).length} scheduled · {drops.length} content calendar{drops.length === 1 ? '' : 's'}
              </span>
              <div className="inline-flex overflow-hidden rounded-lg border border-nativz-border">
                <button
                  type="button"
                  onClick={() => setView('month')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors ${
                    view === 'month'
                      ? 'bg-surface-hover text-text-primary'
                      : 'bg-transparent text-text-muted hover:bg-surface-hover'
                  }`}
                >
                  <CalendarDays size={12} /> Month
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className={`inline-flex items-center gap-1.5 border-l border-nativz-border px-2.5 py-1 text-xs transition-colors ${
                    view === 'list'
                      ? 'bg-surface-hover text-text-primary'
                      : 'bg-transparent text-text-muted hover:bg-surface-hover'
                  }`}
                >
                  <List size={12} /> List
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center text-sm text-text-secondary">
              Loading content calendars…
            </div>
          ) : view === 'month' ? (
            <MonthGrid
              cursor={cursor}
              posts={posts}
              onSelect={(p) => router.push(`/admin/scheduler?postId=${p.id}`)}
            />
          ) : (
            <DropList drops={drops} brandName={brand.name} />
          )}
        </>
      )}

      {brand && (
        <NewDropDialog
          open={showNew}
          onClose={() => setShowNew(false)}
          clientId={brand.id}
          onCreated={(id) => {
            setShowNew(false);
            toast.success('Content calendar created — analysing content…');
            router.push(`/admin/calendar/${id}`);
          }}
        />
      )}
    </div>
  );
}

interface MonthCell {
  date: Date;
  inMonth: boolean;
  posts: SchedulerPost[];
}

function MonthGrid({
  cursor,
  posts,
  onSelect,
}: {
  cursor: Date;
  posts: SchedulerPost[];
  onSelect: (post: SchedulerPost) => void;
}) {
  const weeks = useMemo(() => buildWeeks(cursor, posts), [cursor, posts]);

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="grid grid-cols-7 border-b border-nativz-border text-center text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {weeks.flat().map((cell, idx) => (
          <MonthCellView
            key={idx}
            cell={cell}
            isLastCol={(idx + 1) % 7 === 0}
            isLastRow={idx >= weeks.flat().length - 7}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function MonthCellView({
  cell,
  isLastCol,
  isLastRow,
  onSelect,
}: {
  cell: MonthCell;
  isLastCol: boolean;
  isLastRow: boolean;
  onSelect: (post: SchedulerPost) => void;
}) {
  const isToday = isSameDay(cell.date, new Date());
  return (
    <div
      className={`relative min-h-[120px] p-2 ${
        isLastCol ? '' : 'border-r border-nativz-border'
      } ${isLastRow ? '' : 'border-b border-nativz-border'} ${
        cell.inMonth ? 'bg-surface' : 'bg-background/40'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className={`text-xs ${
            isToday
              ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-text font-semibold text-white'
              : cell.inMonth
                ? 'font-medium text-text-secondary'
                : 'text-text-muted/50'
          }`}
        >
          {cell.date.getDate()}
        </span>
        {cell.posts.length > 2 && (
          <span className="text-[10px] text-text-muted">+{cell.posts.length - 2} more</span>
        )}
      </div>
      <div className="space-y-1">
        {cell.posts.slice(0, 2).map((p) => (
          <PostTile key={p.id} post={p} onClick={() => onSelect(p)} />
        ))}
      </div>
    </div>
  );
}

function PostTile({ post, onClick }: { post: SchedulerPost; onClick: () => void }) {
  const time = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';
  const thumb = post.cover_image_url ?? post.thumbnail_url;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-1.5 overflow-hidden rounded-md border border-nativz-border bg-background/60 p-1 text-left transition-colors hover:bg-surface-hover"
      title={post.caption}
    >
      <div className="aspect-[9/16] w-7 shrink-0 overflow-hidden rounded bg-surface-hover">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Film size={10} className="text-text-muted" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-medium text-text-primary">{time}</p>
        <p className="truncate text-[10px] text-text-muted">
          {post.caption.trim() || 'No caption'}
        </p>
      </div>
    </button>
  );
}

function DropList({ drops, brandName }: { drops: ContentDrop[]; brandName: string }) {
  if (drops.length === 0) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
        <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
        <p className="text-sm text-text-secondary">No content calendars yet for {brandName}.</p>
        <p className="mt-1 text-xs text-text-muted">
          Click <span className="text-text-secondary">New content calendar</span> to add your first batch of content.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {drops.map((d) => (
        <DropCard key={d.id} drop={d} />
      ))}
    </div>
  );
}

function DropCard({ drop }: { drop: ContentDrop }) {
  return (
    <a
      href={`/admin/calendar/${drop.id}`}
      className="block rounded-xl border border-nativz-border bg-surface p-4 transition-colors hover:bg-surface-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {drop.start_date} → {drop.end_date}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {drop.processed_videos}/{drop.total_videos} videos · default {drop.default_post_time}
          </p>
        </div>
        <StatusBadge status={drop.status} />
      </div>
      {drop.error_detail && (
        <p className="mt-2 text-xs text-red-400">{drop.error_detail}</p>
      )}
    </a>
  );
}

const STATUS_LABEL: Record<DropStatus, string> = {
  ingesting: 'Ingesting',
  analyzing: 'Analysing',
  generating: 'Captioning',
  ready: 'Ready',
  scheduled: 'Scheduled',
  failed: 'Failed',
};

const STATUS_TONE: Record<DropStatus, string> = {
  ingesting: 'bg-blue-500/10 text-blue-300',
  analyzing: 'bg-blue-500/10 text-blue-300',
  generating: 'bg-blue-500/10 text-blue-300',
  ready: 'bg-amber-500/10 text-amber-300',
  scheduled: 'bg-emerald-500/10 text-emerald-300',
  failed: 'bg-red-500/10 text-red-300',
};

function StatusBadge({ status }: { status: DropStatus }) {
  const inFlight = status === 'ingesting' || status === 'analyzing' || status === 'generating';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status]}`}
    >
      {inFlight && <Loader2 size={10} className="animate-spin" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function buildWeeks(cursor: Date, posts: SchedulerPost[]): MonthCell[][] {
  const postsByDay: Record<string, SchedulerPost[]> = {};
  for (const p of posts) {
    if (!p.scheduled_at) continue;
    const key = ymdKey(new Date(p.scheduled_at));
    (postsByDay[key] ||= []).push(p);
  }
  for (const list of Object.values(postsByDay)) {
    list.sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''));
  }

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  // Week starts Monday — convert getDay() (0=Sun..6=Sat) to a 0=Mon..6=Sun offset.
  const startOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - startOffset);

  const weeks: MonthCell[][] = [];
  const probe = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const week: MonthCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(probe);
      week.push({
        date,
        inMonth: date.getMonth() === monthStart.getMonth(),
        posts: postsByDay[ymdKey(date)] ?? [],
      });
      probe.setDate(probe.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function ymdKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

interface NewDropDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onCreated: (id: string) => void;
}

function NewDropDialog({ open, onClose, clientId, onCreated }: NewDropDialogProps) {
  const today = new Date().toISOString().slice(0, 10);
  const weekLater = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [folderUrl, setFolderUrl] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(weekLater);
  const [defaultTime, setDefaultTime] = useState('10:00');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFolderUrl('');
      setSubmitting(false);
    }
  }, [open]);

  async function handleCreate() {
    if (!folderUrl.trim()) {
      toast.error('Drive folder URL required');
      return;
    }
    setSubmitting(true);
    let success = false;
    try {
      const res = await fetch('/api/calendar/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          driveFolderUrl: folderUrl.trim(),
          startDate,
          endDate,
          defaultPostTime: defaultTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to create content calendar');
      success = true;
      onCreated(data.drop.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create content calendar');
    } finally {
      if (!success) setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New content calendar" maxWidth="lg">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-secondary">
            Google Drive folder
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-2">
            <FolderInput size={14} className="shrink-0 text-text-muted" />
            <input
              value={folderUrl}
              onChange={(e) => setFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none"
              disabled={submitting}
            />
          </div>
          <p className="text-xs text-text-muted">
            The folder must be shared so your connected Google account can read it.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={submitting}
          />
          <Input
            label="End date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-secondary">Default post time (UTC)</label>
          <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-2">
            <Clock size={14} className="shrink-0 text-text-muted" />
            <input
              type="time"
              value={defaultTime}
              onChange={(e) => setDefaultTime(e.target.value)}
              className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
              disabled={submitting}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {submitting ? 'Creating…' : 'Create content calendar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
