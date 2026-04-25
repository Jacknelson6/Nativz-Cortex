'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ClipboardList,
  FileText,
  AlertCircle,
  Check,
  Clock,
  Pause,
  Archive,
  Sparkles,
  MoreVertical,
  Send,
} from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import {
  PRIMARY_STATUS_LABEL,
  PRIMARY_STATUS_PILL,
  type PrimaryStatus,
  type SalesPipelineRow,
  type SalesRowFlow,
} from '@/lib/sales/pipeline';

const FILTER_ORDER: Array<'all' | PrimaryStatus> = [
  'all',
  'lead_no_proposal',
  'drafted',
  'sent',
  'viewed',
  'signed',
  'awaiting_payment',
  'paid',
  'onboarding',
  'active',
  'archived',
];

const FILTER_LABEL: Record<'all' | PrimaryStatus, string> = {
  all: 'All',
  ...PRIMARY_STATUS_LABEL,
};

const STATUS_ICON: Record<PrimaryStatus, React.ReactNode> = {
  drafted: <FileText size={11} />,
  sent: <Clock size={11} />,
  viewed: <AlertCircle size={11} />,
  signed: <Check size={11} />,
  awaiting_payment: <Clock size={11} />,
  paid: <Check size={11} />,
  onboarding: <ClipboardList size={11} />,
  active: <Sparkles size={11} />,
  archived: <Archive size={11} />,
  lead_no_proposal: <Pause size={11} />,
};

/**
 * Pipeline roster — one row per client. Each row collapses both the
 * proposal AND the onboarding flow into a single visual unit so the
 * admin sees "where is this brand on the journey" without bouncing
 * between two surfaces.
 *
 * Filter chip + headline-card selection writes through to the URL
 * (`?status=foo`) so deep links work and the browser back button
 * walks the user back through their filter history. Row enter
 * animation is staggered for the first ~24 rows; later rows fade in
 * without delay to avoid feeling "loading". Detail.design refs:
 *   - #21 Keep state in URL
 *   - #4  Stagger for the event order
 *   - #6  Smooth highlight block transition
 */
export function SalesPipelineRoster({
  rows,
  counts,
  initialStatus,
}: {
  rows: SalesPipelineRow[];
  counts: Record<PrimaryStatus, number>;
  initialStatus: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = (FILTER_ORDER as string[]).includes(initialStatus)
    ? (initialStatus as 'all' | PrimaryStatus)
    : 'all';
  const [filter, setFilter] = useState<'all' | PrimaryStatus>(initial);

  // Keep the filter state in sync with the URL — useful when the user
  // hits the back button after clicking a chip, or when the page is
  // re-rendered with a different initialStatus from server-side.
  useEffect(() => {
    const qs = searchParams.get('status');
    const next = qs && (FILTER_ORDER as string[]).includes(qs) ? (qs as 'all' | PrimaryStatus) : 'all';
    setFilter(next);
  }, [searchParams]);

  function applyFilter(next: 'all' | PrimaryStatus) {
    setFilter(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('status');
    else params.set('status', next);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.primary_status === filter);
  }, [filter, rows]);

  // Headline pipeline counts — show only the buckets that matter for
  // the day-to-day "what needs my attention" question.
  const headlineBuckets: PrimaryStatus[] = [
    'sent',
    'viewed',
    'awaiting_payment',
    'onboarding',
    'active',
  ];

  return (
    <div className="space-y-4">
      {/* Headline pipeline summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {headlineBuckets.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => applyFilter(b)}
            className={`rounded-xl border bg-surface px-3 py-2.5 text-left transition-all duration-200 ease-out ${
              filter === b
                ? 'border-accent/60 bg-accent/5 ring-1 ring-accent/20'
                : 'border-nativz-border hover:bg-surface-hover hover:border-nativz-border/80'
            }`}
            aria-pressed={filter === b}
          >
            <div className="text-[10px] uppercase tracking-wider text-text-muted">
              {PRIMARY_STATUS_LABEL[b]}
            </div>
            <div className="mt-0.5 text-lg font-semibold text-text-primary">{counts[b]}</div>
          </button>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_ORDER.map((f) => {
          const count = f === 'all' ? rows.length : counts[f];
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => applyFilter(f)}
              aria-pressed={active}
              className={`relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ${
                active
                  ? 'border-accent/60 bg-accent/10 text-text-primary'
                  : 'border-nativz-border bg-surface text-text-muted hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              {/* Larger hit area for chip — extends 4px outside the visible
                  pill on every side without affecting layout. (#43) */}
              <span className="absolute -inset-1" aria-hidden />
              {FILTER_LABEL[f]}
              <span className="text-[10px] text-text-muted/80">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Roster */}
      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-10 text-center">
          {filter === 'all' ? (
            <p className="text-sm text-text-muted">
              No pipeline yet. Click <strong className="text-text-primary">Start</strong> to spin up your first prospect or onboard an existing client.
            </p>
          ) : (
            <p className="text-sm text-text-muted">
              No rows in <strong className="text-text-primary">{FILTER_LABEL[filter]}</strong> right now.{' '}
              <button
                type="button"
                onClick={() => applyFilter('all')}
                className="text-accent-text hover:underline"
              >
                Show all
              </button>
              .
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-hover/40 text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Proposal</th>
                <th className="px-4 py-3 font-medium">Onboarding</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
                <th className="px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-nativz-border/60">
              {filteredRows.map((r, i) => (
                <PipelineRow key={r.client.id} row={r} index={i} />
              ))}
            </tbody>
          </table>
          <style jsx>{`
            @keyframes rowFadeIn {
              from {
                opacity: 0;
                transform: translateY(4px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @media (prefers-reduced-motion: reduce) {
              :global(tr[data-pipeline-row]) {
                animation: none !important;
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

function PipelineRow({ row, index }: { row: SalesPipelineRow; index: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [openMenu, setOpenMenu] = useState(false);
  const [busy, setBusy] = useState(false);

  // Stagger only the first 24 rows so a long pipeline doesn't take a
  // full second to land. Anything beyond skips the delay. (#4)
  const delayMs = Math.min(index, 24) * 30;
  const proposalLink = row.latest_proposal
    ? `/admin/proposals/${row.latest_proposal.slug}`
    : null;
  const flowLink = row.flow ? `/admin/onboarding/${row.flow.id}` : null;
  const primaryLink = flowLink ?? proposalLink ?? `/admin/clients/${row.client.slug}`;

  const proposalIsResendable =
    !!row.latest_proposal && ['sent', 'viewed'].includes(row.latest_proposal.status);
  const flowIsArchivable = !!row.flow && row.flow.status !== 'archived';

  async function resendProposal() {
    if (!row.latest_proposal || busy) return;
    setBusy(true);
    setOpenMenu(false);
    try {
      const res = await fetch(`/api/admin/proposals/${row.latest_proposal.id}/send`, {
        method: 'POST',
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error("Couldn't resend proposal", { description: json?.error ?? `failed (${res.status})` });
        return;
      }
      toast.success(`Resent to ${row.client.name}`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function archiveFlow() {
    if (!row.flow || busy) return;
    if (!confirm(`Archive the onboarding flow for ${row.client.name}? You can re-open it later.`)) return;
    setBusy(true);
    setOpenMenu(false);
    try {
      const res = await fetch(`/api/onboarding/flows/${row.flow.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error("Couldn't archive flow", { description: json?.error ?? `failed (${res.status})` });
        return;
      }
      toast.success(`Archived ${row.client.name}`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr
      data-pipeline-row
      className="transition-colors hover:bg-surface-hover/30"
      style={{
        animation: `rowFadeIn 220ms ease-out both`,
        animationDelay: `${delayMs}ms`,
      }}
    >
      <td className="px-4 py-3">
        <Link href={primaryLink} className="flex items-center gap-3" aria-label={`Open ${row.client.name}`}>
          <ClientLogo src={row.client.logo_url} name={row.client.name} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium text-text-primary">{row.client.name}</div>
            <div className="font-mono text-[11px] text-text-muted/70">
              {row.client.slug}
              {row.client.lifecycle_state === 'lead' && !row.flow ? (
                <span className="ml-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-200">
                  Lead
                </span>
              ) : null}
            </div>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${PRIMARY_STATUS_PILL[row.primary_status]}`}
        >
          {STATUS_ICON[row.primary_status]}
          {PRIMARY_STATUS_LABEL[row.primary_status]}
        </span>
      </td>
      <td className="px-4 py-3 text-text-muted">
        {row.latest_proposal ? (
          <Link
            href={`/admin/proposals/${row.latest_proposal.slug}`}
            className="text-[12px] hover:text-text-primary"
          >
            {labelForProposal(row.latest_proposal)}
          </Link>
        ) : (
          <span className="text-[12px] text-text-muted/60">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-text-muted">
        {row.flow ? (
          <Link
            href={`/admin/onboarding/${row.flow.id}`}
            className="text-[12px] hover:text-text-primary"
          >
            {labelForFlow(row.flow.status)}
          </Link>
        ) : (
          <span className="text-[12px] text-text-muted/60">Not started</span>
        )}
      </td>
      <td className="px-4 py-3 text-text-muted">
        {row.last_activity_at
          ? new Date(row.last_activity_at).toLocaleDateString()
          : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={primaryLink}
            className="text-[12px] text-accent-text hover:underline"
          >
            Open →
          </Link>
          {(proposalIsResendable || flowIsArchivable) ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu((s) => !s)}
                disabled={busy}
                aria-label={`More actions for ${row.client.name}`}
                aria-haspopup="menu"
                aria-expanded={openMenu}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
              >
                <MoreVertical size={14} />
              </button>
              {openMenu ? (
                <RowActionMenu
                  onClose={() => setOpenMenu(false)}
                  onResend={proposalIsResendable ? resendProposal : null}
                  onArchive={flowIsArchivable ? archiveFlow : null}
                  busy={busy}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function RowActionMenu({
  onClose,
  onResend,
  onArchive,
  busy,
}: {
  onClose: () => void;
  onResend: (() => void) | null;
  onArchive: (() => void) | null;
  busy: boolean;
}) {
  // Esc + outside click close — interruptible animation pattern (#5).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-row-action-menu]')) return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [onClose]);

  return (
    <div
      data-row-action-menu
      role="menu"
      className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-nativz-border bg-surface text-[12px] shadow-xl"
    >
      {onResend ? (
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={onResend}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
        >
          <Send size={12} />
          Resend proposal
        </button>
      ) : null}
      {onArchive ? (
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={onArchive}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
        >
          <Archive size={12} />
          Archive flow
        </button>
      ) : null}
    </div>
  );
}

function labelForProposal(p: NonNullable<SalesPipelineRow['latest_proposal']>): string {
  switch (p.status) {
    case 'draft':
      return 'Drafted';
    case 'sent':
      return p.viewed_at ? 'Viewed' : 'Sent';
    case 'viewed':
      return 'Viewed';
    case 'signed':
      return p.paid_at ? 'Signed · paid' : 'Signed · awaiting payment';
    case 'paid':
      return 'Paid';
    case 'expired':
      return 'Expired';
    case 'canceled':
      return 'Canceled';
    default:
      return p.status;
  }
}

function labelForFlow(status: SalesRowFlow['status']): string {
  switch (status) {
    case 'needs_proposal':
      return 'Awaiting proposal';
    case 'awaiting_payment':
      return 'Awaiting payment';
    case 'active':
      return 'In progress';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Completed';
    case 'archived':
      return 'Archived';
    default:
      return String(status);
  }
}
