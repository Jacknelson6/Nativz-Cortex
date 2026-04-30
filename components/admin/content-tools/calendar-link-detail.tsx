'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  MessagesSquare,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ClientLogo } from '@/components/clients/client-logo';
import type {
  ReviewLinkRow,
  ReviewLinkStatus,
} from '@/components/scheduler/review-board';

/**
 * Detail dialog for a calendar share link (rows with `kind === 'calendar'`
 * in the unified review table). Mirrors the look + feel of
 * `EditingProjectDetail` so the two row types feel like one product.
 *
 * Why a dialog instead of routing to `/c/<token>`:
 * Jack's flow is "I clicked on a brand row to look at the project, not
 * to take the client view." Auto-opening the share page meant always
 * loading the customer-facing surface just to copy a link or check
 * approval state. The dialog surfaces:
 *
 *   - The share URL itself, copyable inline (the primary affordance)
 *   - "Open" to launch `/c/<token>` in a new tab when he actually wants it
 *   - Approval / revising / pending counters at a glance
 *   - Created / expires / abandoned timestamps
 *   - A revoke action for non-expired links
 *
 * Read-only on purpose: rename + project_type editing already happen
 * inline on the table row, so the dialog stays a focused inspector.
 */

export function CalendarLinkDetail({
  link,
  onClose,
  onRevoked,
}: {
  link: ReviewLinkRow | null;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const open = !!link;
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset transient UI state when a new link is opened.
  useEffect(() => {
    if (open) setCopied(false);
  }, [open, link?.id]);

  const shareUrl = useMemo(() => {
    if (!link?.token) return '';
    if (typeof window === 'undefined') return `/c/${link.token}`;
    return `${window.location.origin}/c/${link.token}`;
  }, [link?.token]);

  if (!open || !link) return null;

  const isExpired = link.status === 'expired';
  const isAbandoned = link.status === 'abandoned';
  const dateRange = formatDateRange(link.drop_start, link.drop_end);

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy link');
    }
  }

  async function revoke() {
    if (revoking || !link) return;
    if (!confirm('Revoke this share link? Anyone who has it will see an "expired" page on next visit.')) {
      return;
    }
    setRevoking(true);
    try {
      const res = await fetch(`/api/calendar/share/${link.token}/revoke`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to revoke');
      }
      toast.success('Link revoked');
      onRevoked();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="" maxWidth="2xl" bodyClassName="p-0">
      <div className="flex h-full max-h-[80vh] flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-nativz-border px-6 py-4">
          <ClientLogo
            src={link.client_logo_url}
            name={link.client_name ?? 'Client'}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-muted">
              {link.client_name ?? 'Unassigned brand'}
            </p>
            <p className="text-lg font-semibold text-text-primary">
              {link.name && link.name.trim().length > 0 ? link.name : dateRange}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={link.status} />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Share link — primary affordance. Sits up top so copying
              the URL takes one click from the table click. */}
          <Section label="Share link">
            <div className="rounded-lg border border-nativz-border bg-surface p-3">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="block w-full truncate rounded-md border border-nativz-border bg-background px-3 py-2 font-mono text-[12px] text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={copyShareUrl}
                  aria-label="Copy share link"
                >
                  <Copy size={13} />
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-accent-surface/40 px-2.5 text-[12px] font-medium text-accent-text transition-colors hover:bg-accent-surface/60"
                >
                  Open
                  <ExternalLink size={11} />
                </a>
              </div>
              {(isExpired || isAbandoned) && (
                <p className="mt-2 text-[11px] text-text-muted">
                  {isExpired
                    ? 'This link is expired. Visitors will see the expired page on next load.'
                    : 'This link is marked abandoned. The client never approved or revised.'}
                </p>
              )}
            </div>
          </Section>

          {/* Counts: approved / revising / pending. Skipped when the
              project has zero posts so the modal doesn't read as broken
              for an empty calendar. */}
          {link.post_count > 0 && (
            <Section label={`Posts (${link.post_count})`}>
              <div className="flex flex-wrap gap-2">
                <Counter
                  icon={<CheckCircle2 size={12} />}
                  label="approved"
                  value={link.approved_count}
                  tone="success"
                />
                <Counter
                  icon={<MessagesSquare size={12} />}
                  label="revising"
                  value={link.changes_count}
                  tone="warning"
                />
                <Counter
                  icon={<Eye size={12} />}
                  label="pending"
                  value={link.pending_count}
                  tone="muted"
                />
              </div>
            </Section>
          )}

          {/* Project metadata. Date range + last-viewed are the only
              two fields that actually drive Jack's followup decision. */}
          <Section label="Project">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Date range">
                <span className="inline-flex items-center gap-1.5 text-text-secondary">
                  <CalendarDays size={12} className="text-text-tertiary" />
                  {dateRange}
                </span>
              </Field>
              <Field label="Last viewed">
                <span className="inline-flex items-center gap-1.5 text-text-secondary">
                  <Clock3 size={12} className="text-text-tertiary" />
                  {link.last_viewed_at ? formatRelative(link.last_viewed_at) : 'Never'}
                </span>
              </Field>
              <Field label="Created">
                <span className="text-text-secondary">
                  {formatTimestamp(link.created_at)}
                </span>
              </Field>
              <Field label="Expires">
                <span className="text-text-secondary">
                  {formatTimestamp(link.expires_at)}
                </span>
              </Field>
              {link.followup_count > 0 && (
                <Field label="Follow-ups sent">
                  <span className="text-text-secondary">
                    {link.followup_count}
                    {link.last_followup_at ? ` (last ${formatRelative(link.last_followup_at)})` : ''}
                  </span>
                </Field>
              )}
              {link.abandoned_at && (
                <Field label="Abandoned">
                  <span className="text-text-secondary">
                    {formatTimestamp(link.abandoned_at)}
                  </span>
                </Field>
              )}
            </dl>
          </Section>

          {/* Footer actions. Revoke lives down here on purpose — it's
              destructive enough that putting it in the header next to
              Close would invite mis-clicks. */}
          {!isExpired && (
            <div className="flex justify-end border-t border-nativz-border pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={revoke}
                disabled={revoking}
                className="text-status-danger hover:bg-status-danger/10"
              >
                {revoking ? 'Revoking...' : 'Revoke link'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Counter({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'muted';
}) {
  const toneClasses: Record<typeof tone, string> = {
    success: 'border-status-success/20 bg-status-success/10 text-status-success',
    warning: 'border-status-warning/20 bg-status-warning/10 text-status-warning',
    muted: 'border-nativz-border bg-surface text-text-secondary',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClasses[tone]}`}
    >
      {icon}
      <span className="font-semibold">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function StatusPill({ status }: { status: ReviewLinkStatus }) {
  const config: Record<
    ReviewLinkStatus,
    { label: string; className: string }
  > = {
    approved: {
      label: 'Approved',
      className: 'bg-status-success/10 text-status-success border-status-success/20',
    },
    revising: {
      label: 'Revising',
      className: 'bg-accent-surface/30 text-accent-text border-accent-text/20',
    },
    ready_for_review: {
      label: 'Ready for review',
      className: 'bg-status-warning/10 text-status-warning border-status-warning/20',
    },
    expired: {
      label: 'Expired',
      className: 'bg-text-muted/10 text-text-muted border-text-muted/20',
    },
    abandoned: {
      label: 'Abandoned',
      className: 'bg-status-danger/10 text-status-danger border-status-danger/20',
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
    return `${sM} ${s.getDate()} to ${e.getDate()}, ${s.getFullYear()}`;
  }
  if (sameYear) {
    return `${sM} ${s.getDate()} to ${eM} ${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${sM} ${s.getDate()}, ${s.getFullYear()} to ${eM} ${e.getDate()}, ${e.getFullYear()}`;
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

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('default', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
