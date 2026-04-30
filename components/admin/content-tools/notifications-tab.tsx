'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bell,
  Mail,
  RefreshCcw,
  Send,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Notifications tab. Two stacked panels in one column:
 *
 *   1. Recent activity feed -- last N transactional emails the
 *      content pipeline has fired (followups, revision notifies,
 *      final-call nudges). Pulled from `email_log` filtered by the
 *      calendar-related type keys; one row per send.
 *   2. POC contacts list -- "who gets notified when". This used to
 *      live on the per-brand /review page; the cross-brand view here
 *      summarizes how many POCs each brand has registered, so an
 *      admin can spot brands with notifications turned off entirely.
 *
 * Each panel owns its own loading / error state so a contacts-API
 * regression can't block the activity feed from rendering, and vice
 * versa.
 */

type EmailKind =
  | 'calendar_followup'
  | 'calendar_share'
  | 'calendar_final_call'
  | 'calendar_revisions'
  | 'calendar_comment_digest'
  | 'calendar_reminder';

interface ActivityRow {
  id: string;
  typeKey: EmailKind | string;
  subject: string;
  to: string[];
  clientName: string | null;
  sentAt: string;
  status: string | null;
}

interface ContactsSummaryRow {
  clientId: string;
  clientName: string;
  total: number;
  notifyEnabled: number;
}

export function NotificationsTab() {
  return (
    <div className="space-y-4">
      <ActivityFeed />
      <ContactsOverview />
    </div>
  );
}

function ActivityFeed() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(
        '/api/admin/content-tools/email-activity',
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`Activity feed unreachable (HTTP ${res.status})`);
      const data = (await res.json()) as { rows: ActivityRow[] };
      setRows(data.rows ?? []);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load activity';
      // Toast on a manual refresh so the click feels acknowledged; the
      // inline banner survives across renders so the failure stays
      // visible for the next admin who opens the tab.
      if (silent) toast.error(message);
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-nativz-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
            <Send className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary">
              Recent activity
            </div>
            <div className="mt-0.5 text-xs text-text-muted">
              Last transactional emails the content pipeline has sent
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          aria-label="Refresh activity"
        >
          <RefreshCcw
            size={14}
            className={refreshing ? 'animate-spin' : ''}
          />
        </Button>
      </div>

      {error && !loading && (
        <div className="flex items-start gap-2 border-b border-status-danger/20 bg-status-danger/5 px-5 py-3 text-xs text-status-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">Couldn&apos;t reach the activity feed.</div>
            <div className="mt-0.5 text-status-danger/80">{error}</div>
          </div>
        </div>
      )}

      {loading ? (
        <ActivitySkeleton />
      ) : error && rows.length === 0 ? (
        <ActivityErrorEmpty />
      ) : rows.length === 0 ? (
        <ActivityEmpty />
      ) : (
        <ul className="divide-y divide-nativz-border/60">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <KindBadge kind={row.typeKey} />
                  <span className="truncate text-sm font-medium text-text-primary">
                    {row.subject || '(no subject)'}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-text-muted">
                  {row.clientName ? `${row.clientName} · ` : ''}
                  {row.to.join(', ')}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs tabular-nums text-text-muted">
                  {formatRelative(row.sentAt)}
                </div>
                {row.status && row.status !== 'sent' && (
                  <div className="mt-0.5 text-[11px] uppercase tracking-wide text-status-danger">
                    {row.status}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactsOverview() {
  const [rows, setRows] = useState<ContactsSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        '/api/admin/content-tools/contacts-summary',
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`Contacts summary unreachable (HTTP ${res.status})`);
      const data = (await res.json()) as { rows: ContactsSummaryRow[] };
      setRows(data.rows ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const brandsWithoutNotify = rows.filter((r) => r.notifyEnabled === 0).length;

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="flex items-center gap-3 border-b border-nativz-border px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
          <Bell className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-primary">
            Review contacts
          </div>
          <div className="mt-0.5 text-xs text-text-muted">
            {loading
              ? 'Loading...'
              : brandsWithoutNotify === 0
                ? `${rows.length} brand${rows.length === 1 ? '' : 's'} with at least one POC`
                : `${brandsWithoutNotify} brand${brandsWithoutNotify === 1 ? ' has' : 's have'} notifications off`}
          </div>
        </div>
      </div>

      {error && !loading && (
        <div className="flex items-start gap-2 border-b border-status-danger/20 bg-status-danger/5 px-5 py-3 text-xs text-status-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">Couldn&apos;t reach the contacts API.</div>
            <div className="mt-0.5 text-status-danger/80">{error}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="divide-y divide-nativz-border/60">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="h-3 w-32 animate-pulse rounded bg-nativz-border" />
              <div className="ml-auto h-3 w-20 animate-pulse rounded bg-nativz-border" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Mail className="mx-auto mb-3 h-7 w-7 text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            No review POCs registered.
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Add review contacts on each brand from /review.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-nativz-border/60">
          {rows.map((row) => (
            <li
              key={row.clientId}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">
                  {row.clientName}
                </div>
                <div className="mt-0.5 text-xs text-text-muted">
                  {row.total} contact{row.total === 1 ? '' : 's'} ·{' '}
                  {row.notifyEnabled} notified on send
                </div>
              </div>
              {row.notifyEnabled === 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-status-warning/30 bg-status-warning/10 px-2 py-0.5 text-[11px] font-medium text-status-warning">
                  Notifications off
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-status-success/30 bg-status-success/10 px-2 py-0.5 text-[11px] font-medium text-status-success">
                  Live
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const meta = KIND_META[kind] ?? { label: kind, tone: 'border-nativz-border bg-background text-text-muted' };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
}

const KIND_META: Record<string, { label: string; tone: string }> = {
  calendar_share: {
    label: 'Share',
    tone: 'border-accent-text/30 bg-accent-text/10 text-accent-text',
  },
  calendar_followup: {
    label: 'Followup',
    tone: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  },
  calendar_final_call: {
    label: 'Final call',
    tone: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
  },
  calendar_revisions: {
    label: 'Revisions',
    tone: 'border-accent-text/30 bg-accent-text/10 text-accent-text',
  },
  calendar_comment_digest: {
    label: 'Comments',
    tone: 'border-text-secondary/30 bg-text-secondary/10 text-text-secondary',
  },
  calendar_reminder: {
    label: 'Reminder',
    tone: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  },
};

function ActivitySkeleton() {
  return (
    <div className="divide-y divide-nativz-border/60">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3">
          <div className="h-4 w-12 animate-pulse rounded-full bg-nativz-border" />
          <div className="h-4 w-48 animate-pulse rounded bg-nativz-border" />
          <div className="ml-auto h-3 w-12 animate-pulse rounded bg-nativz-border" />
        </div>
      ))}
    </div>
  );
}

function ActivityEmpty() {
  return (
    <div className="px-5 py-10 text-center">
      <Inbox className="mx-auto mb-3 h-7 w-7 text-text-tertiary" />
      <p className="text-sm text-text-secondary">No emails sent yet.</p>
      <p className="mt-1 text-xs text-text-muted">
        Calendar shares, followups, and revision notifies will appear here.
      </p>
    </div>
  );
}

function ActivityErrorEmpty() {
  return (
    <div className="px-5 py-10 text-center">
      <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-status-danger/70" />
      <p className="text-sm text-text-secondary">
        Activity feed temporarily unavailable.
      </p>
      <p className="mt-1 text-xs text-text-muted">
        Try the refresh button. If it persists, check the email_messages
        Supabase table for write activity.
      </p>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < hr) return `${Math.max(1, Math.round(diff / min))}m`;
  if (diff < day) return `${Math.round(diff / hr)}h`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d`;
  return new Date(iso).toLocaleDateString();
}
