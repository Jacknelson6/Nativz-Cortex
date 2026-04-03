'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CalendarPost, CalendarViewMode, MediaItem } from './types';
import { STATUS_CONFIG } from './types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface CalendarViewProps {
  viewMode: CalendarViewMode;
  posts: CalendarPost[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onPostClick: (post: CalendarPost) => void;
  onDateClick: (date: Date) => void;
  onDropMedia: (date: Date, media: MediaItem) => void;
}

export function CalendarView({
  viewMode,
  posts,
  currentDate,
  onDateChange,
  onPostClick,
  onDateClick,
  onDropMedia,
}: CalendarViewProps) {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  if (viewMode === 'list') {
    return <ListView posts={posts} onPostClick={onPostClick} />;
  }

  if (viewMode === 'week') {
    return (
      <WeekView
        posts={posts}
        currentDate={currentDate}
        onPostClick={onPostClick}
        onDateClick={onDateClick}
        onDropMedia={onDropMedia}
        today={today}
      />
    );
  }

  // Month view (default)
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Adjust for Monday start
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const totalCells = startOffset + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);

  const cells: { date: Date; dateStr: string; inMonth: boolean }[] = [];
  for (let i = 0; i < rows * 7; i++) {
    const date = new Date(year, month, 1 - startOffset + i);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    cells.push({ date, dateStr, inMonth: date.getMonth() === month });
  }

  // Group posts by date
  const postsByDate: Record<string, CalendarPost[]> = {};
  posts.forEach(p => {
    if (!p.scheduled_at) return;
    const d = new Date(p.scheduled_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!postsByDate[key]) postsByDate[key] = [];
    postsByDate[key].push(p);
  });

  function handleDragOver(e: React.DragEvent, dateStr: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverDate(dateStr);
  }

  function handleDragLeave() {
    setDragOverDate(null);
  }

  function handleDrop(e: React.DragEvent, date: Date) {
    e.preventDefault();
    setDragOverDate(null);
    try {
      const media = JSON.parse(e.dataTransfer.getData('application/json')) as MediaItem;
      onDropMedia(date, media);
    } catch {
      // Invalid drop data
    }
  }

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  return (
    <div className="flex flex-col h-full">
      {/* Navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-nativz-border">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => onDateChange(new Date())}>
            Today
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDateChange(new Date(year, month - 1, 1))}>
            <ChevronLeft size={16} />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDateChange(new Date(year, month + 1, 1))}>
            <ChevronRight size={16} />
          </Button>
          <h2 className="text-base font-semibold text-text-primary">
            {monthName} {year}
          </h2>
        </div>
        <span className="text-xs text-text-muted">
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </span>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-nativz-border">
        {WEEKDAYS.map(d => (
          <div key={d} className="px-2 py-1.5 text-xs font-medium text-text-muted text-center">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {cells.map(({ date, dateStr, inMonth }) => {
          const dayPosts = postsByDate[dateStr] ?? [];
          const isToday = dateStr === today;
          const isDragOver = dragOverDate === dateStr;

          return (
            <div
              key={dateStr}
              onClick={() => onDateClick(date)}
              onDragOver={(e) => handleDragOver(e, dateStr)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, date)}
              className={`
                border-b border-r border-nativz-border p-1 min-h-[80px] cursor-pointer transition-colors
                ${!inMonth ? 'opacity-40' : ''}
                ${isToday ? 'bg-accent-surface/10' : 'hover:bg-surface-hover/50'}
                ${isDragOver ? 'bg-accent-surface/20 ring-1 ring-inset ring-accent-text/40' : ''}
              `}
            >
              <span className={`text-xs font-medium ${isToday ? 'text-accent-text' : 'text-text-secondary'}`}>
                {date.getDate()}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {dayPosts.slice(0, 3).map(post => (
                  <PostChip key={post.id} post={post} onClick={() => onPostClick(post)} />
                ))}
                {dayPosts.length > 3 && (
                  <span className="text-[10px] text-text-muted">+{dayPosts.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostChip({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
  const config = STATUS_CONFIG[post.status];
  const time = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-surface-hover transition-colors cursor-pointer"
    >
      {post.thumbnail_url || post.cover_image_url ? (
        <img
          src={post.thumbnail_url ?? post.cover_image_url ?? ''}
          alt=""
          className="w-5 h-5 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-5 h-5 rounded bg-surface-hover flex-shrink-0" />
      )}
      <span className="text-[10px] text-text-secondary truncate">{time}</span>
      <Badge variant={config.variant} className="text-[10px] px-1 py-0 ml-auto flex-shrink-0">
        {config.label}
      </Badge>
    </button>
  );
}

function WeekView({
  posts,
  currentDate,
  onPostClick,
  onDateClick,
  onDropMedia,
  today,
}: {
  posts: CalendarPost[];
  currentDate: Date;
  onPostClick: (post: CalendarPost) => void;
  onDateClick: (date: Date) => void;
  onDropMedia: (date: Date, media: MediaItem) => void;
  today: string;
}) {
  // Get start of week (Monday)
  const d = new Date(currentDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(d.setDate(diff));

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { date, dateStr };
  });

  const postsByDate: Record<string, CalendarPost[]> = {};
  posts.forEach(p => {
    if (!p.scheduled_at) return;
    const d = new Date(p.scheduled_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!postsByDate[key]) postsByDate[key] = [];
    postsByDate[key].push(p);
  });

  return (
    <div className="flex-1 grid grid-cols-7 divide-x divide-nativz-border">
      {days.map(({ date, dateStr }) => {
        const dayPosts = (postsByDate[dateStr] ?? []).sort((a, b) => {
          if (!a.scheduled_at || !b.scheduled_at) return 0;
          return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
        });
        const isToday = dateStr === today;

        return (
          <div
            key={dateStr}
            onClick={() => onDateClick(date)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={(e) => {
              e.preventDefault();
              try {
                const media = JSON.parse(e.dataTransfer.getData('application/json')) as MediaItem;
                onDropMedia(date, media);
              } catch { /* ignore */ }
            }}
            className={`flex flex-col min-h-0 cursor-pointer ${isToday ? 'bg-accent-surface/10' : ''}`}
          >
            <div className="p-2 text-center border-b border-nativz-border">
              <div className="text-xs text-text-muted">{WEEKDAYS[days.indexOf({ date, dateStr }) % 7] ?? date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div className={`text-sm font-medium ${isToday ? 'text-accent-text' : 'text-text-primary'}`}>
                {date.getDate()}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-1 space-y-1">
              {dayPosts.map(post => (
                <PostChip key={post.id} post={post} onClick={() => onPostClick(post)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ posts, onPostClick }: { posts: CalendarPost[]; onPostClick: (post: CalendarPost) => void }) {
  const sorted = [...posts].sort((a, b) => {
    if (!a.scheduled_at || !b.scheduled_at) return 0;
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  });

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-nativz-border">
      {sorted.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-text-muted">
          No posts scheduled
        </div>
      ) : (
        sorted.map(post => {
          const config = STATUS_CONFIG[post.status];
          return (
            <button
              key={post.id}
              onClick={() => onPostClick(post)}
              className="w-full flex items-center gap-3 p-3 hover:bg-surface-hover transition-colors text-left cursor-pointer"
            >
              {post.thumbnail_url || post.cover_image_url ? (
                <img
                  src={post.thumbnail_url ?? post.cover_image_url ?? ''}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-surface-hover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">
                  {post.caption || 'No caption'}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {post.scheduled_at
                    ? new Date(post.scheduled_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : 'No date set'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex -space-x-1">
                  {post.platforms.map((p, i) => (
                    <span key={i} className="text-[10px] bg-surface-hover rounded-full px-1.5 py-0.5 border border-nativz-border">
                      {p.platform.charAt(0).toUpperCase()}
                    </span>
                  ))}
                </div>
                <Badge variant={config.variant}>{config.label}</Badge>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
