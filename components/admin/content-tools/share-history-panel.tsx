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
 * Module-level SWR-ish cache for activity feeds. Keyed by `endpoint`.
 *
 * Why module-level: the panel mounts/unmounts as the parent dialog
 * toggles tabs ("Details" -> "History"). Without a cache, every tab
 * flip burned a fresh GET and showed a spinner for ~300ms — Jack
 * specifically called out that the History tab "should also be cached"
 * so flipping back and forth feels instant.
 *
 * Strategy: cache hit renders the prior payload immediately AND kicks
 * off a background refresh so the activity stays current. Cache miss
 * shows the loading state once, then populates.
 */
const HISTORY_CACHE = new Map<string, ShareHistoryEvent[]>();

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
         * Set on calendar feeds, where successful sends come from the
         * `share_link_emails` archive. When non-null the row is clickable
         * and opens the email replay dialog.
         */
        email_id?: string | null;
        /**
         * Kind from `share_link_emails.kind` — drives the row copy
         * ("Revised videos sent", "Content calendar sent", etc.).
         */
        email_kind?: string | null;
        /**
         * Legacy editing-projects feed still emits `email_messages.type_key`
         * (`editing_deliverable`, `editing_rereview`, `content_drop_followup`).
         * Used as a fallback for the row copy when `email_kind` is absent.
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
  nounSingular = 'deliverable',
  onClickEmail,
}: {
  endpoint: string;
  emptyMessage?: string;
  /**
   * Singular noun for the deliverable type (e.g. "post", "ad", "video"). Drives
   * the activity-feed verb so the row reads "Jane approved a post" instead of
   * "Jane approved a video" when the project isn't a video cut. Defaults to
   * "deliverable" so callers that don't care still get sensible copy.
   */
  nounSingular?: string;
  /**
   * When provided, email-sent rows that carry an `email_id` become
   * clickable buttons that hand the id back to the parent so it can
   * open the email replay dialog. Failed sends and editing-projects'
   * legacy rows (which carry `type_key` but no archive id) stay as
   * static rows.
   */
  onClickEmail?: (emailId: string) => void;
}) {
  const [events, setEvents] = useState<ShareHistoryEvent[] | null>(
    () => HISTORY_CACHE.get(endpoint) ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = HISTORY_CACHE.get(endpoint) ?? null;
    setEvents(cached);
    setError(null);
    (async () => {
      try {
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load activity');
        const body = (await res.json()) as { activity: ShareHistoryEvent[] };
        if (cancelled) return;
        HISTORY_CACHE.set(endpoint, body.activity);
        setEvents(body.activity);
      } catch (err) {
        if (!cancelled && cached === null) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
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
        <HistoryRow
          key={`${e.kind}-${e.at}-${i}`}
          event={e}
          nounSingular={nounSingular}
          onClickEmail={onClickEmail}
        />
      ))}
    </ol>
  );
}

function HistoryRow({
  event,
  nounSingular,
  onClickEmail,
}: {
  event: ShareHistoryEvent;
  nounSingular: string;
  onClickEmail?: (emailId: string) => void;
}) {
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
    const verb = reviewVerb(status, author_name, nounSingular);
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
  const verb = emailVerb({
    kind: event.detail.email_kind ?? null,
    typeKey: event.detail.type_key ?? null,
    failed,
  });
  const emailId = event.detail.email_id ?? null;
  const clickable = !!emailId && !!onClickEmail && !failed;

  const inner = (
    <>
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
          {verb}
          {event.detail.to ? ` to ${event.detail.to}` : ''}
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
    </>
  );

  if (clickable) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onClickEmail!(emailId!)}
          className="flex w-full items-start gap-3 rounded-lg border border-nativz-border bg-surface p-3 text-left transition hover:border-accent-text/40 hover:bg-surface-hover"
        >
          {inner}
        </button>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3 rounded-lg border border-nativz-border bg-surface p-3">
      {inner}
    </li>
  );
}

function emailVerb({
  kind,
  typeKey,
  failed,
}: {
  kind: string | null;
  typeKey: string | null;
  failed: boolean;
}): string {
  // share_link_emails.kind is the source of truth on the calendar feed.
  // Map each kind to a human verb that reads like an audit-log entry.
  const kindLabel = (() => {
    switch (kind) {
      case 'initial':
        return 'Content calendar sent';
      case 'resend':
        return 'Content calendar resent';
      case 'manual_followup':
        return 'Manual follow-up sent';
      case 'auto_followup_open':
        return 'Auto follow-up sent (no opens yet)';
      case 'auto_followup_action':
        return 'Auto follow-up sent (no action yet)';
      case 'auto_followup_final':
        return 'Final follow-up sent';
      case 'all_approved':
        return 'All-approved confirmation sent';
      case 'revisions_complete':
        return 'Revised videos sent';
      default:
        return null;
    }
  })();

  if (kindLabel) {
    return failed ? kindLabel.replace('sent', 'failed') : kindLabel;
  }

  // Fallback: legacy editing-projects feed still ships type_key.
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
  nounSingular: string,
): string {
  const article = /^[aeiou]/i.test(nounSingular) ? 'an' : 'a';
  if (status === 'approved') return `${author} approved ${article} ${nounSingular}`;
  if (status === 'changes_requested') return `${author} requested changes`;
  if (status === 'video_revised')
    return `${author} uploaded a revised ${nounSingular}`;
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
