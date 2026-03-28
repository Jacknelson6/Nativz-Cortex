'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  Trash2,
  FileText,
  Flame,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { formatRelativeTime } from '@/lib/utils/format';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  post_top_performer: <Flame size={16} className="text-orange-400" />,
  engagement_spike: <TrendingUp size={16} className="text-emerald-400" />,
  follower_milestone: <Users size={16} className="text-accent2-text" />,
  post_trending: <Zap size={16} className="text-yellow-400" />,
  report_published: <FileText size={16} className="text-accent-text" />,
  concepts_ready: <FileText size={16} className="text-emerald-400" />,
};

interface PortalNotificationListProps {
  notifications: Notification[];
}

export function PortalNotificationList({ notifications: initialNotifications }: PortalNotificationListProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function markAllRead() {
    try {
      await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch { /* ignore */ }
  }

  async function clearAll() {
    try {
      const res = await fetch('/api/notifications/clear-all', { method: 'POST' });
      if (res.ok) {
        setNotifications([]);
        router.refresh();
      }
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
          prev.map((n) => n.id === notif.id ? { ...n, is_read: true } : n)
        );
      } catch { /* ignore */ }
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
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="ui-page-title flex items-center gap-2.5">
            <Bell size={20} className="text-accent-text" />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Stay updated on your content performance and reports.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              <Check size={14} />
              Mark all read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button variant="ghost" size="sm" className="text-text-muted hover:text-red-400" onClick={clearAll}>
              <Trash2 size={14} />
              Clear all
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell size={24} />}
          title="No notifications yet"
          description="You'll be notified when reports are published, content is trending, or milestones are reached."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => (
            <Card
              key={notif.id}
              padding="none"
              interactive
              className={!notif.is_read ? 'ring-1 ring-accent/30' : ''}
            >
              <button
                type="button"
                onClick={() => handleClick(notif)}
                className="flex w-full items-start gap-3.5 px-5 py-4 text-left"
              >
                <div className="mt-0.5 shrink-0">
                  {TYPE_ICON[notif.type] || <Bell size={16} className="text-text-muted" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm leading-snug ${!notif.is_read ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>
                    {notif.title}
                  </p>
                  {notif.body && (
                    <p className="mt-0.5 text-xs text-text-muted line-clamp-2">{notif.body}</p>
                  )}
                  <p className="mt-1.5 text-xs text-text-muted/60">
                    {formatRelativeTime(notif.created_at)}
                  </p>
                </div>
                {!notif.is_read && (
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
                )}
              </button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
