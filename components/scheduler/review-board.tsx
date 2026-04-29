'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  MessagesSquare,
  Plus,
  RefreshCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Review board — bento-grid view of share-link inventory. Used by:
 *  - /review (admin variant — brand-scoped via the active pill)
 *  - /admin/share-links (cross-brand oversight, no clientId filter)
 *
 * Viewers see a different surface (table layout) at /review; this
 * component is admin-only in practice, but `isAdmin` stays a prop so
 * the same component can be reused if we ever want a stripped-down
 * read-only bento for shared / external viewers. Data comes from
 * `/api/calendar/review`, which already handles server-side scoping —
 * the request is unauthenticated callers never receive links for
 * clients they can't access.
 */

export interface ReviewLinkRow {
  id: string;
  token: string;
  drop_id: string;
  drop_start: string | null;
  drop_end: string | null;
  client_id: string | null;
  client_name: string | null;
  post_count: number;
  approved_count: number;
  changes_count: number;
  pending_count: number;
  status: 'expired' | 'approved' | 'revising' | 'ready_for_review';
  expires_at: string;
  created_at: string;
  last_viewed_at: string | null;
}

interface ReviewBoardProps {
  isAdmin: boolean;
  /** Where the "Create new share link" CTA should send admins. Falls
   *  back to the calendar entry if not provided. */
  createHref?: string;
  /** When set, the API call appends `?clientId=` so the board renders
   *  only that brand's share links. Used by `/review` (admin variant —
   *  scoped to the active brand pill). Leave null for the cross-brand
   *  admin oversight page at `/admin/share-links`. */
  clientId?: string | null;
  /** Optional title override. Defaults to "Review". Cross-brand admin
   *  tool uses "Share links" to make the scope clear. */
  title?: string;
  /** Optional description override under the title. */
  description?: string;
  /** When false, hide the brand label on each card (the page is already
   *  brand-scoped so the chip is redundant). Defaults to following
   *  `clientId` — null = show, set = hide. */
  showBrandOnCards?: boolean;
}

export function ReviewBoard({
  isAdmin,
  createHref = '/admin/calendar',
  clientId = null,
  title,
  description,
  showBrandOnCards,
}: ReviewBoardProps) {
  const [links, setLinks] = useState<ReviewLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cards drop the brand label by default whenever the page is already
  // scoped to a single brand (the active pill makes the chip redundant).
  const showBrand = showBrandOnCards ?? clientId === null;

  async function load(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const url = clientId
        ? `/api/calendar/review?clientId=${encodeURIComponent(clientId)}`
        : '/api/calendar/review';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load share links');
      const data = (await res.json()) as { links: ReviewLinkRow[] };
      setLinks(data.links ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load share links');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // Re-fetch whenever the active brand changes (admin flips the pill).
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const active = links.filter((l) => l.status !== 'expired');
    const expired = links.filter((l) => l.status === 'expired');
    return { active, expired };
  }, [links]);

  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text-primary">{title ?? 'Review'}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {description ??
              (isAdmin
                ? 'Share links you’ve sent for client review. Open one to see comments, approvals, and revision status.'
                : 'Calendars you’ve received from your team. Open one to leave feedback or approve posts.')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>
          {isAdmin && (
            <Link href={createHref}>
              <Button size="sm">
                <Plus size={14} />
                Create new
              </Button>
            </Link>
          )}
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-nativz-border bg-surface"
            />
          ))}
        </div>
      ) : links.length === 0 ? (
        <EmptyState isAdmin={isAdmin} createHref={createHref} />
      ) : (
        <>
          {grouped.active.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {grouped.active.map((l) => (
                <ReviewCard
                  key={l.id}
                  link={l}
                  isAdmin={isAdmin}
                  showBrand={showBrand}
                  onChange={() => void load(true)}
                />
              ))}
            </div>
          )}

          {grouped.expired.length > 0 && (
            <section className="space-y-3 pt-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Expired
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {grouped.expired.map((l) => (
                  <ReviewCard
                    key={l.id}
                    link={l}
                    isAdmin={isAdmin}
                    showBrand={showBrand}
                    onChange={() => void load(true)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ isAdmin, createHref }: { isAdmin: boolean; createHref: string }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
      <MessagesSquare className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
      <p className="text-sm text-text-secondary">No share links yet.</p>
      <p className="mt-1 text-xs text-text-muted">
        {isAdmin
          ? 'Build a calendar, pick posts, and send a share link — you’ll see it here with live status.'
          : 'Your team hasn’t sent a calendar for review yet. They’ll show up here when they do.'}
      </p>
      {isAdmin && (
        <div className="mt-4">
          <Link href={createHref}>
            <Button size="sm">
              <Plus size={14} />
              Go to calendar
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  link,
  isAdmin,
  showBrand,
  onChange,
}: {
  link: ReviewLinkRow;
  isAdmin: boolean;
  showBrand: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isExpired = link.status === 'expired';
  const dateRange = formatDateRange(link.drop_start, link.drop_end);
  const lastViewed = link.last_viewed_at ? formatRelative(link.last_viewed_at) : null;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/c/${link.token}` : `/c/${link.token}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  }

  async function revoke() {
    if (busy) return;
    if (!confirm('Revoke this share link? Anyone who has it will see an "expired" page on next visit.')) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/calendar/share/${link.token}/revoke`, { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to revoke');
      }
      toast.success('Link revoked');
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={`group relative flex flex-col gap-3 rounded-xl border bg-surface p-4 transition-colors hover:border-accent-text/40 ${
        isExpired ? 'border-nativz-border/60 opacity-70' : 'border-nativz-border'
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
            <CalendarDays size={13} className="text-text-tertiary" />
            <span className="truncate">{dateRange}</span>
          </p>
          {isAdmin && showBrand && link.client_name && (
            <p className="truncate text-xs text-text-muted">{link.client_name}</p>
          )}
        </div>
        <StatusPill status={link.status} />
      </header>

      <div className="flex items-center gap-3 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1">
          <span className="font-medium text-text-primary">{link.post_count}</span> post
          {link.post_count === 1 ? '' : 's'}
        </span>
        {link.approved_count > 0 && (
          <span className="inline-flex items-center gap-1 text-status-success">
            <CheckCircle2 size={12} />
            {link.approved_count} approved
          </span>
        )}
        {link.changes_count > 0 && (
          <span className="inline-flex items-center gap-1 text-status-warning">
            <MessagesSquare size={12} />
            {link.changes_count} revising
          </span>
        )}
      </div>

      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-nativz-border pt-3">
        <p className="text-[11px] text-text-muted">
          {lastViewed ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 size={11} />
              Last viewed {lastViewed}
            </span>
          ) : (
            <span>Never viewed</span>
          )}
        </p>
        <div className="flex items-center gap-1">
          {isAdmin && !isExpired && (
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              title="Copy link"
            >
              <Copy size={13} />
            </button>
          )}
          {isAdmin && !isExpired && (
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-text-muted transition-colors hover:bg-status-danger/10 hover:text-status-danger disabled:opacity-50"
              title="Revoke link"
            >
              Revoke
            </button>
          )}
          <Link
            href={`/c/${link.token}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded-md bg-accent-surface/40 px-2 text-[11px] font-medium text-accent-text transition-colors hover:bg-accent-surface/60"
          >
            Open
            <ExternalLink size={11} />
          </Link>
        </div>
      </footer>
    </article>
  );
}

function StatusPill({ status }: { status: ReviewLinkRow['status'] }) {
  const config: Record<
    ReviewLinkRow['status'],
    { label: string; className: string }
  > = {
    approved: {
      label: 'Approved',
      className: 'bg-status-success/10 text-status-success border-status-success/20',
    },
    revising: {
      label: 'Revising',
      className: 'bg-status-warning/10 text-status-warning border-status-warning/20',
    },
    ready_for_review: {
      label: 'Ready for review',
      className: 'bg-accent-surface/30 text-accent-text border-accent-text/20',
    },
    expired: {
      label: 'Expired',
      className: 'bg-text-muted/10 text-text-muted border-text-muted/20',
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.className}`}
    >
      {c.label}
    </span>
  );
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) return 'Calendar';
  const s = new Date(start);
  const e = new Date(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  const sM = s.toLocaleString('default', { month: 'short' });
  const eM = e.toLocaleString('default', { month: 'short' });
  if (s.getMonth() === e.getMonth() && sameYear) {
    return `${sM} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  if (sameYear) {
    return `${sM} ${s.getDate()} – ${eM} ${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${sM} ${s.getDate()}, ${s.getFullYear()} – ${eM} ${e.getDate()}, ${e.getFullYear()}`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < hr) return `${Math.max(1, Math.round(diff / min))}m ago`;
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}
