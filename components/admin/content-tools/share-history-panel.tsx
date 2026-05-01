'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Film,
  Link2,
  Loader2,
  Mail,
  MailX,
  MessageSquare,
  Paperclip,
  RefreshCw,
} from 'lucide-react';

/**
 * Shared "History" tab panel used by both EditingProjectDetail and
 * CalendarLinkDetail. Both endpoints return the same activity shape:
 *
 *   - share_link        ← someone minted a share link
 *   - share_link_view   ← someone opened /c/<token>
 *   - email_sent        ← outbound notification email (sent or failed)
 *   - revision_uploaded ← editor uploaded a revised cut (version > 1)
 *
 * The caller passes `endpoint` (the GET url) so the panel doesn't need
 * to know the difference between an editing project and a content drop.
 */

export type ShareHistoryEvent =
  | {
      kind: 'share_link';
      at: string;
      detail: { url: string; created_by: string | null };
    }
  | {
      kind: 'share_link_view';
      at: string;
      detail: { viewer_name: string | null; share_url: string };
    }
  | {
      kind: 'email_sent';
      at: string;
      detail: {
        to: string;
        subject: string | null;
        status: string | null;
        failure_reason: string | null;
        /**
         * Lets us distinguish a delivery (`editing_deliverable`), re-review
         * (`editing_rereview`), or calendar followup (`content_drop_followup`)
         * row when it lands in the same feed.
         */
        type_key?: string | null;
      };
    }
  | {
      kind: 'revision_uploaded';
      at: string;
      detail: {
        version: number;
        title: string | null;
        position: number;
      };
    }
  | {
      kind: 'review_comment';
      at: string;
      detail: {
        author_name: string;
        status: 'approved' | 'changes_requested' | 'comment' | 'video_revised';
        content: string;
        video_id: string | null;
        attachment_count: number;
      };
    };

export function ShareHistoryPanel({
  endpoint,
  emptyMessage = 'No activity yet. Mint a share link or send a notification to get started.',
}: {
  endpoint: string;
  emptyMessage?: string;
}) {
  const [events, setEvents] = useState<ShareHistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load activity');
        const body = (await res.json()) as { activity: ShareHistoryEvent[] };
        if (!cancelled) setEvents(body.activity);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  if (error) {
    return (
      <div className="rounded-lg border border-nativz-border bg-surface p-4 text-sm text-[color:var(--status-danger)]">
        {error}
      </div>
    );
  }
  if (events === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin" />
        Loading history...
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-nativz-border bg-surface p-8 text-center">
        <p className="text-sm text-text-secondary">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {events.map((e, i) => (
        <HistoryRow key={`${e.kind}-${e.at}-${i}`} event={e} />
      ))}
    </ol>
  );
}

function HistoryRow({ event }: { event: ShareHistoryEvent }) {
  const ts = formatTimestamp(event.at);

  if (event.kind === 'share_link') {
    return (
      <li className="flex items-start gap-3 rounded-lg border border-nativz-border bg-surface p-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-surface text-accent-text">
          <Link2 size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-primary">Share link minted</p>
          <p className="truncate text-xs text-text-muted">{event.detail.url}</p>
        </div>
        <span className="shrink-0 text-[11px] text-text-muted">{ts}</span>
      </li>
    );
  }

  if (event.kind === 'share_link_view') {
    const who = event.detail.viewer_name?.trim() || 'Anonymous viewer';
    return (
      <li className="flex items-start gap-3 rounded-lg border border-nativz-border bg-surface p-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
          <Eye size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-primary">{who} viewed the link</p>
          {event.detail.share_url && (
            <p className="truncate text-xs text-text-muted">{event.detail.share_url}</p>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-text-muted">{ts}</span>
      </li>
    );
  }

  if (event.kind === 'revision_uploaded') {
    const cutLabel =
      event.detail.title?.trim() || `Cut #${event.detail.position + 1}`;
    return (
      <li className="flex items-start gap-3 rounded-lg border border-nativz-border bg-surface p-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-surface text-accent-text">
          <Film size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-primary">
            Revision uploaded: {cutLabel}{' '}
            <span className="text-text-muted">v{event.detail.version}</span>
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-text-muted">{ts}</span>
      </li>
    );
  }

  if (event.kind === 'review_comment') {
    const { author_name, status, content, attachment_count } = event.detail;
    const swatch = reviewSwatch(status);
    const verb = reviewVerb(status, author_name);
    return (
      <li className="flex items-start gap-3 rounded-lg border border-nativz-border bg-surface p-3">
        <span
          className={
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ' +
            swatch.cls
          }
        >
          {swatch.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-primary">{verb}</p>
          {content && (
            <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
              {content}
            </p>
          )}
          {attachment_count > 0 && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-text-muted">
              <Paperclip size={10} />
              {attachment_count} attachment
              {attachment_count === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-text-muted">{ts}</span>
      </li>
    );
  }

  // email_sent
  const failed = event.detail.status === 'failed';
  const verb = emailVerb(event.detail.type_key, failed);
  return (
    <li className="flex items-start gap-3 rounded-lg border border-nativz-border bg-surface p-3">
      <span
        className={
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ' +
          (failed
            ? 'bg-[color:var(--status-danger)]/10 text-[color:var(--status-danger)]'
            : 'bg-accent-surface text-accent-text')
        }
      >
        {failed ? <MailX size={13} /> : <Mail size={13} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary">
          {verb} to {event.detail.to}
        </p>
        {event.detail.subject && (
          <p className="truncate text-xs text-text-muted">{event.detail.subject}</p>
        )}
        {failed && event.detail.failure_reason && (
          <p className="mt-1 text-[11px] text-[color:var(--status-danger)]">
            {event.detail.failure_reason}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[11px] text-text-muted">{ts}</span>
    </li>
  );
}

function emailVerb(typeKey: string | null | undefined, failed: boolean): string {
  if (failed) {
    if (typeKey === 'editing_rereview') return 'Re-review email failed';
    if (typeKey === 'editing_deliverable') return 'Delivery email failed';
    if (typeKey === 'content_drop_followup') return 'Follow-up email failed';
    return 'Notification failed';
  }
  if (typeKey === 'editing_rereview') return 'Re-review email sent';
  if (typeKey === 'editing_deliverable') return 'Delivery email sent';
  if (typeKey === 'content_drop_followup') return 'Follow-up email sent';
  return 'Notification sent';
}

function reviewSwatch(status: 'approved' | 'changes_requested' | 'comment' | 'video_revised'): {
  cls: string;
  icon: React.ReactNode;
} {
  if (status === 'approved') {
    return {
      cls: 'bg-emerald-500/10 text-emerald-400',
      icon: <CheckCircle2 size={13} />,
    };
  }
  if (status === 'changes_requested') {
    return {
      cls: 'bg-amber-500/10 text-amber-400',
      icon: <AlertTriangle size={13} />,
    };
  }
  if (status === 'video_revised') {
    return {
      cls: 'bg-accent-surface text-accent-text',
      icon: <RefreshCw size={13} />,
    };
  }
  return {
    cls: 'bg-surface-hover text-text-secondary',
    icon: <MessageSquare size={13} />,
  };
}

function reviewVerb(
  status: 'approved' | 'changes_requested' | 'comment' | 'video_revised',
  author: string,
): string {
  if (status === 'approved') return `${author} approved a video`;
  if (status === 'changes_requested') return `${author} requested changes`;
  if (status === 'video_revised') return `${author} uploaded a revised video`;
  return `${author} left a comment`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('default', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
