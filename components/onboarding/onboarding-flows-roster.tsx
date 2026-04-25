'use client';

import Link from 'next/link';
import { ClipboardList, AlertCircle, Clock, Check, Pause, Archive } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import type { FlowStatus } from '@/lib/onboarding/flows';

type FlowRow = {
  id: string;
  status: FlowStatus;
  proposal_id: string | null;
  share_token: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  clients: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    agency: string | null;
  } | null;
};

const STATUS_LABEL: Record<FlowStatus, string> = {
  needs_proposal: 'Needs proposal',
  awaiting_payment: 'Awaiting payment',
  active: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_PILL: Record<FlowStatus, string> = {
  needs_proposal: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  awaiting_payment: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
  active: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  paused: 'border-zinc-400/40 bg-zinc-400/10 text-zinc-200',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  archived: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
};

const STATUS_ICON: Record<FlowStatus, React.ReactNode> = {
  needs_proposal: <AlertCircle size={11} />,
  awaiting_payment: <Clock size={11} />,
  active: <ClipboardList size={11} />,
  paused: <Pause size={11} />,
  completed: <Check size={11} />,
  archived: <Archive size={11} />,
};

export function OnboardingFlowsRoster({ flows }: { flows: FlowRow[] }) {
  if (flows.length === 0) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-10 text-center">
        <p className="text-sm text-text-muted">
          No flows yet. Click <strong className="text-text-primary">Start onboarding</strong> in the top-right to pick a brand and spin one up.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-hover/40 text-[11px] uppercase tracking-wider text-text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Brand</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-nativz-border/60">
          {flows.map((f) => (
            <tr
              key={f.id}
              className="transition-colors hover:bg-surface-hover/30"
            >
              <td className="px-4 py-3">
                <Link href={`/admin/onboarding/${f.id}`} className="flex items-center gap-3">
                  <ClientLogo src={f.clients?.logo_url ?? null} name={f.clients?.name ?? '?'} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-text-primary">{f.clients?.name ?? '(unknown)'}</div>
                    <div className="font-mono text-[11px] text-text-muted/70">{f.clients?.slug ?? ''}</div>
                  </div>
                </Link>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL[f.status]}`}
                >
                  {STATUS_ICON[f.status]}
                  {STATUS_LABEL[f.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-text-muted">
                {f.started_at ? new Date(f.started_at).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3 text-text-muted">
                {new Date(f.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/onboarding/${f.id}`}
                  className="text-[12px] text-accent-text hover:underline"
                >
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
