'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, FileText, AlertCircle, Check, Clock, Pause, Archive, Sparkles } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import {
  PRIMARY_STATUS_LABEL,
  PRIMARY_STATUS_PILL,
  type PrimaryStatus,
  type SalesPipelineRow,
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
 * Click the brand cell or the "Open" link → flow detail page (or the
 * proposal editor when the row is still pre-sign). Click the secondary
 * "Proposal" or "Onboarding" badge → jump straight to that sub-surface.
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
  const initial = (FILTER_ORDER as string[]).includes(initialStatus)
    ? (initialStatus as 'all' | PrimaryStatus)
    : 'all';
  const [filter, setFilter] = useState<'all' | PrimaryStatus>(initial);

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.primary_status === filter);
  }, [filter, rows]);

  // Headline pipeline counts — show only the buckets that matter for
  // the day-to-day "what needs my attention" question. "Lead — no
  // proposal" hides when zero so we don't add visual noise.
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
            onClick={() => setFilter(b)}
            className={`rounded-xl border bg-surface px-3 py-2.5 text-left transition ${
              filter === b
                ? 'border-accent/60 bg-accent/5'
                : 'border-nativz-border hover:bg-surface-hover'
            }`}
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
              onClick={() => setFilter(f)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                active
                  ? 'border-accent/60 bg-accent/10 text-text-primary'
                  : 'border-nativz-border bg-surface text-text-muted hover:bg-surface-hover'
              }`}
            >
              {FILTER_LABEL[f]}
              <span className="text-[10px] text-text-muted/80">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Roster */}
      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-10 text-center">
          <p className="text-sm text-text-muted">
            {filter === 'all'
              ? 'No pipeline yet. Click Start to spin up your first prospect or onboard an existing client.'
              : `No rows in the ${FILTER_LABEL[filter]} bucket right now.`}
          </p>
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
              {filteredRows.map((r) => {
                const proposalLink = r.latest_proposal
                  ? `/admin/proposals/${r.latest_proposal.slug}`
                  : null;
                const flowLink = r.flow ? `/admin/onboarding/${r.flow.id}` : null;
                const primaryLink = flowLink ?? proposalLink ?? `/admin/clients/${r.client.slug}`;

                return (
                  <tr
                    key={r.client.id}
                    className="transition-colors hover:bg-surface-hover/30"
                  >
                    <td className="px-4 py-3">
                      <Link href={primaryLink} className="flex items-center gap-3">
                        <ClientLogo src={r.client.logo_url} name={r.client.name} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-text-primary">
                            {r.client.name}
                          </div>
                          <div className="font-mono text-[11px] text-text-muted/70">
                            {r.client.slug}
                            {r.client.lifecycle_state === 'lead' && !r.flow ? (
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
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${PRIMARY_STATUS_PILL[r.primary_status]}`}
                      >
                        {STATUS_ICON[r.primary_status]}
                        {PRIMARY_STATUS_LABEL[r.primary_status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {r.latest_proposal ? (
                        <Link
                          href={`/admin/proposals/${r.latest_proposal.slug}`}
                          className="text-[12px] hover:text-text-primary"
                        >
                          {labelForProposal(r.latest_proposal)}
                        </Link>
                      ) : (
                        <span className="text-[12px] text-text-muted/60">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {r.flow ? (
                        <Link
                          href={`/admin/onboarding/${r.flow.id}`}
                          className="text-[12px] hover:text-text-primary"
                        >
                          {labelForFlow(r.flow.status)}
                        </Link>
                      ) : (
                        <span className="text-[12px] text-text-muted/60">Not started</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {r.last_activity_at
                        ? new Date(r.last_activity_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={primaryLink}
                        className="text-[12px] text-accent-text hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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

function labelForFlow(status: SalesPipelineRow['flow'] extends infer F ? F extends { status: infer S } ? S : never : never): string {
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
