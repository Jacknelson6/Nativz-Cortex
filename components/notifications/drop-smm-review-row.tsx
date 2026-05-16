'use client';

/**
 * CUP-02 T09: row renderer for the `drop_smm_review_ready` notification type.
 *
 * The actual notification dropdown (components/layout/notification-bell.tsx)
 * renders rows generically off title/body/link_path and uses a TYPE_ICON
 * registry to pick the leading icon. This component exists so callers that
 * want a standalone surface (e.g. a future digest panel, settings preview)
 * can render the same row shape without re-implementing the layout.
 */

import { ClipboardCheck } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';

export interface DropSmmReviewNotification {
  id: string;
  title: string;
  body: string | null;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
}

interface DropSmmReviewRowProps {
  notification: DropSmmReviewNotification;
  onRead?: (id: string) => void;
}

export function DropSmmReviewRow({ notification, onRead }: DropSmmReviewRowProps) {
  const { id, title, body, link_path, is_read, created_at } = notification;

  function handleClick() {
    if (!is_read) onRead?.(id);
    if (link_path) {
      if (link_path.startsWith('http')) {
        window.open(link_path, '_blank', 'noopener');
      } else {
        window.location.href = link_path;
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover ${
        !is_read ? 'bg-accent-surface/30' : ''
      }`}
    >
      <div className="mt-0.5 shrink-0">
        <ClipboardCheck size={14} className="text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm leading-snug ${
            !is_read ? 'font-medium text-text-primary' : 'text-text-secondary'
          }`}
        >
          {title}
        </p>
        {body && (
          <p className="mt-1 text-xs text-text-muted line-clamp-6 break-words">{body}</p>
        )}
        <p className="mt-1 text-xs text-text-muted/60">{formatRelativeTime(created_at)}</p>
      </div>
      {!is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
    </button>
  );
}
