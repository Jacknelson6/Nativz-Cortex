'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  Lightbulb,
  FileText,
  MessageSquare,
  Mail,
  Search,
  Camera,
  CheckSquare,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Flame,
  Users,
  RefreshCcw,
  Zap,
  X,
  WifiOff,
  Trash2,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
}

// All icon colors route through brand status tokens. See globals.css.
// success (brand-green) · warning (amber) · danger (nz-coral) · info (nz-cyan) · trending (amber-600)
const TYPE_ICON: Record<string, React.ReactNode> = {
  idea_submitted: <Lightbulb size={14} className="text-[color:var(--status-warning)]" />,
  report_published: <FileText size={14} className="text-accent-text" />,
  concepts_ready: <FileText size={14} className="text-[color:var(--status-success)]" />,
  feedback_received: <MessageSquare size={14} className="text-accent2-text" />,
  weekly_digest: <Mail size={14} className="text-text-muted" />,
  search_completed: <Search size={14} className="text-[color:var(--status-success)]" />,
  shoot_scheduled: <Camera size={14} className="text-[color:var(--status-info)]" />,
  task_assigned: <CheckSquare size={14} className="text-[color:var(--status-info)]" />,
  task_due_tomorrow: <Clock size={14} className="text-[color:var(--status-warning)]" />,
  task_overdue: <AlertTriangle size={14} className="text-[color:var(--status-danger)]" />,
  task_completed: <CheckCircle size={14} className="text-[color:var(--status-success)]" />,
  monday_status: <FileText size={14} className="text-[color:var(--status-info)]" />,
  pipeline_alert: <AlertTriangle size={14} className="text-[color:var(--status-warning)]" />,
  post_top_performer: <Flame size={14} className="text-[color:var(--status-trending)]" />,
  engagement_spike: <TrendingUp size={14} className="text-[color:var(--status-success)]" />,
  follower_milestone: <Users size={14} className="text-accent2-text" />,
  sync_failed: <RefreshCcw size={14} className="text-[color:var(--status-danger)]" />,
  post_published: <CheckCircle size={14} className="text-[color:var(--status-success)]" />,
  post_failed: <AlertTriangle size={14} className="text-[color:var(--status-danger)]" />,
  post_trending: <Zap size={14} className="text-[color:var(--status-trending)]" />,
  account_disconnected: <WifiOff size={14} className="text-[color:var(--status-warning)]" />,
  topic_search_failed: <AlertTriangle size={14} className="text-[color:var(--status-danger)]" />,
  topic_search_stuck: <Clock size={14} className="text-[color:var(--status-warning)]" />,
};

export function NotificationsWidget() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const { confirm: confirmClearAll, dialog: clearAllDialog } = useConfirm({
    title: 'Clear all notifications?',
    description:
      'This removes every notification from your list. Unread items will be lost. This can’t be undone.',
    confirmLabel: 'Clear all',
    variant: 'danger',
  });

  const fetchNotifications = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/notifications?limit=8', { signal });
      if (res.ok) {
        const data = await res.json();
        if (signal?.aborted) return;
        const normalized: Notification[] = (data.notifications ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (n: any) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body ?? n.message ?? null,
            link_path: n.link_path ?? (n.task_id ? `/admin/tasks?task=${n.task_id}` : null),
            is_read: n.is_read ?? n.read ?? false,
            created_at: n.created_at,
          })
        );
        setNotifications(normalized);
        setUnreadCount(data.unread_count ?? 0);
        sessionStorage.setItem('notifications-widget', JSON.stringify({ notifications: normalized, unreadCount: data.unread_count ?? 0 }));
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      /* ignore — keep showing cached values */
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // AbortController + interval guard so unmount during a fetch (or
    // after a tick fires) cancels the in-flight request and skips any
    // setState that would otherwise warn about an unmounted component.
    const controller = new AbortController();

    // Load from cache instantly so the bell paints before the network.
    const cached = sessionStorage.getItem('notifications-widget');
    if (cached) {
      try {
        const { notifications: n, unreadCount: u } = JSON.parse(cached);
        if (n) setNotifications(n);
        if (u !== undefined) setUnreadCount(u);
        setLoading(false);
      } catch { /* ignore */ }
    }

    // Then refresh in background
    void fetchNotifications(controller.signal);
    const interval = setInterval(() => {
      void fetchNotifications(controller.signal);
    }, 60000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  async function markAllRead() {
    try {
      await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  }

  async function clearAll() {
    const confirmed = await confirmClearAll();
    if (!confirmed) return;
    try {
      const res = await fetch('/api/notifications/clear-all', { method: 'POST' });
      if (res.ok) {
        setNotifications([]);
        setUnreadCount(0);
        sessionStorage.setItem(
          'notifications-widget',
          JSON.stringify({ notifications: [], unreadCount: 0 })
        );
      }
    } catch {
      /* ignore */
    }
  }

  async function handleDelete(e: React.MouseEvent, notif: Notification) {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    if (!notif.is_read) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${notif.id}`, { method: 'DELETE' });
    } catch { /* ignore */ }
  }

  async function handleClick(notif: Notification) {
    if (!notif.is_read) {
      try {
        await fetch(`/api/notifications/${notif.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ read: true }),
        });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        /* ignore */
      }
    }
    if (notif.link_path) {
      if (notif.link_path.startsWith('http')) {
        window.open(notif.link_path, '_blank', 'noopener');
      } else {
        router.push(notif.link_path);
      }
    }
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      {clearAllDialog}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
          <Bell size={16} className="text-accent-text" />
          Notifications
          {unreadCount > 0 && (
            <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-accent-text hover:text-accent-hover transition-colors"
            >
              <Check size={12} />
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-[color:var(--status-danger)] transition-colors"
            >
              <Trash2 size={12} />
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 -mx-1">
      <div className="h-full max-h-[320px] overflow-y-auto" style={{ maskImage: 'linear-gradient(to bottom, black calc(100% - 48px), transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 48px), transparent 100%)' }}>
        {loading ? (
          <div className="px-1">
            {/* One skeleton per loader — not a stack of fake rows. */}
            <div className="h-40 w-full rounded-[var(--nz-radius-md)] bg-surface-elevated animate-pulse" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bell size={20} className="mb-2 text-text-muted/40" />
            <p className="text-sm text-text-muted">No notifications</p>
            <p className="text-xs text-text-muted/60 mt-0.5">You&apos;re all caught up</p>
          </div>
        ) : (
          <div>
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`group flex w-full items-start gap-3 px-2 py-2.5 text-left rounded-lg transition-colors hover:bg-surface-hover ${
                  !notif.is_read ? 'bg-accent-surface/20' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleClick(notif)}
                  className="flex items-start gap-2 flex-1 min-w-0 text-left"
                >
                  {/* Thumbnail with error fallback */}
                  {notif.body && /^https?:\/\//i.test(notif.body) ? (
                    <img
                      src={notif.body}
                      alt=""
                      className="mt-0.5 h-9 w-9 shrink-0 rounded-md object-cover bg-surface-elevated"
                      onError={(e) => {
                        // Replace broken image with icon
                        const el = e.currentTarget;
                        el.style.display = 'none';
                        const icon = el.parentElement?.querySelector('[data-fallback-icon]');
                        if (icon) (icon as HTMLElement).style.display = '';
                      }}
                    />
                  ) : null}
                  {/* Fallback icon (or primary icon if no thumbnail) */}
                  <div
                    className="mt-0.5 shrink-0"
                    data-fallback-icon
                    style={notif.body && /^https?:\/\//i.test(notif.body) ? { display: 'none' } : undefined}
                  >
                    {TYPE_ICON[notif.type] || <Bell size={14} className="text-text-muted" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm leading-snug ${
                        !notif.is_read ? 'font-medium text-text-primary' : 'text-text-secondary'
                      }`}
                    >
                      {notif.title}
                    </p>
                    {notif.body && !/^https?:\/\//i.test(notif.body) && (
                      <p className="mt-1 text-xs text-text-muted line-clamp-5 break-words">
                        {notif.body}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-text-muted/60">
                      {formatRelativeTime(notif.created_at)}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0 mt-1">
                  {!notif.is_read && (
                    <span className="h-2 w-2 rounded-full bg-accent" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, notif)}
                    className="h-5 w-5 flex items-center justify-center rounded text-text-muted/0 group-hover:text-text-muted hover:!text-[color:var(--status-danger)] transition-colors cursor-pointer"
                    title="Delete notification"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </Card>
  );
}
